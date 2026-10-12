from __future__ import annotations

import io
import os
import re
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path as FilePath

from flask import Flask, render_template, request, send_file
from pypdf import PdfWriter

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 250 * 1024 * 1024  # 250 MB total request

WORD_EXTENSIONS = {".doc", ".docx"}
POWERPOINT_EXTENSIONS = {".ppt", ".pptx"}
PDF_EXTENSIONS = {".pdf"}
SUPPORTED_EXTENSIONS = WORD_EXTENSIONS | POWERPOINT_EXTENSIONS | PDF_EXTENSIONS


@app.route("/")
def home():
    return render_template("index.html")


def detect_file_type(filename: str) -> str | None:
    extension = FilePath(filename).suffix.lower()
    if extension in WORD_EXTENSIONS:
        return "word"
    if extension in POWERPOINT_EXTENSIONS:
        return "powerpoint"
    if extension in PDF_EXTENSIONS:
        return "pdf"
    return None


def safe_output_name(name: str, fallback: str = "Converted") -> str:
    """Keep readable Unicode names while removing paths and unsafe characters."""
    name = (name or "").strip()
    name = FilePath(name).name
    if name.lower().endswith(".pdf"):
        name = name[:-4]
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name).strip(" .")
    return name or fallback


def convert_office_to_pdf(input_path: str, output_dir: str, original_name: str) -> str:
    """Convert one Word/PowerPoint document using LibreOffice headlessly."""
    libreoffice = shutil.which("libreoffice") or shutil.which("soffice")
    if not libreoffice:
        raise RuntimeError(
            "محرك LibreOffice غير موجود على الخادم. تأكد من تثبيته عبر Dockerfile."
        )

    input_stem = FilePath(input_path).stem
    expected_output = os.path.join(output_dir, f"{input_stem}.pdf")
    profile_dir = tempfile.mkdtemp(prefix="lo_profile_")

    try:
        command = [
            libreoffice,
            f"-env:UserInstallation={FilePath(profile_dir).resolve().as_uri()}",
            "--headless",
            "--convert-to",
            "pdf",
            "--outdir",
            output_dir,
            input_path,
        ]
        result = subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=90,
            check=False,
        )

        if result.returncode != 0 or not os.path.isfile(expected_output):
            detail = (result.stderr or result.stdout or "").strip()
            raise RuntimeError(
                f"تعذر تحويل الملف «{original_name}» إلى PDF."
                + (f" التفاصيل: {detail[:500]}" if detail else "")
            )

        return expected_output
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(
            f"استغرق تحويل «{original_name}» وقتًا أطول من المسموح."
        ) from exc
    finally:
        shutil.rmtree(profile_dir, ignore_errors=True)


def merge_pdf_files(pdf_files: list[str], output_file: str) -> None:
    writer = PdfWriter()
    try:
        # Append in the exact order received from the browser.
        for pdf_file in pdf_files:
            writer.append(pdf_file)
        with open(output_file, "wb") as output:
            writer.write(output)
    finally:
        writer.close()


def send_result(path: str, download_name: str, mimetype: str):
    # Read bytes before TemporaryDirectory cleans up the source file.
    with open(path, "rb") as file_handle:
        data = io.BytesIO(file_handle.read())
    data.seek(0)
    return send_file(
        data,
        mimetype=mimetype,
        as_attachment=True,
        download_name=download_name,
    )


@app.errorhandler(413)
def file_too_large(_error):
    return "حجم الملفات يتجاوز الحد المسموح (250 ميجابايت).", 413


@app.route("/convert", methods=["POST"])
def convert():
    files = request.files.getlist("files")
    output_mode = request.form.get("outputMode", "single").lower()
    output_name = safe_output_name(request.form.get("outputName", ""), "Merged")

    valid_files = [file for file in files if file and file.filename]
    if not valid_files:
        return "لم يتم اختيار أي ملفات.", 400

    detected_types = [detect_file_type(file.filename) for file in valid_files]
    if any(file_type is None for file_type in detected_types):
        return (
            "يوجد نوع ملف غير مدعوم. الأنواع المدعومة: DOC, DOCX, PPT, PPTX, PDF.",
            400,
        )

    if len(set(detected_types)) != 1:
        return (
            "اختر ملفات من النوع نفسه في كل عملية؛ لا يمكن خلط Word وPowerPoint وPDF.",
            400,
        )

    file_type = detected_types[0]
    if output_mode not in {"single", "merge"}:
        output_mode = "single"

    # PDF selections always produce one merged PDF.
    if file_type == "pdf":
        output_mode = "merge"

    with tempfile.TemporaryDirectory(prefix="fileconverter_") as temp_root:
        uploads_dir = os.path.join(temp_root, "uploads")
        output_dir = os.path.join(temp_root, "output")
        os.makedirs(uploads_dir, exist_ok=True)
        os.makedirs(output_dir, exist_ok=True)

        saved_inputs = []
        converted_pdfs = []

        try:
            # Unique numbered storage names avoid collisions when source names repeat.
            for index, uploaded in enumerate(valid_files, start=1):
                original_name = FilePath(uploaded.filename).name
                extension = FilePath(original_name).suffix.lower()
                input_path = os.path.join(uploads_dir, f"{index:03d}{extension}")
                uploaded.save(input_path)
                saved_inputs.append((input_path, original_name, extension))

            if file_type == "pdf":
                converted_pdfs = [item[0] for item in saved_inputs]
            else:
                for input_path, original_name, _extension in saved_inputs:
                    converted_pdfs.append(
                        convert_office_to_pdf(input_path, output_dir, original_name)
                    )

            # One output PDF with every document in the selected order.
            if output_mode == "merge":
                merged_path = os.path.join(output_dir, "result.pdf")
                merge_pdf_files(converted_pdfs, merged_path)
                return send_result(
                    merged_path, f"{output_name}.pdf", "application/pdf"
                )

            # One separate conversion can be downloaded directly.
            if len(converted_pdfs) == 1:
                original_stem = FilePath(valid_files[0].filename).stem
                download_name = f"{safe_output_name(original_stem)}.pdf"
                return send_result(
                    converted_pdfs[0], download_name, "application/pdf"
                )

            # Several separate conversions are packaged into one ZIP download.
            zip_path = os.path.join(output_dir, "converted_files.zip")
            used_names = set()
            with zipfile.ZipFile(
                zip_path, mode="w", compression=zipfile.ZIP_DEFLATED
            ) as archive:
                for index, (pdf_path, source) in enumerate(
                    zip(converted_pdfs, saved_inputs), start=1
                ):
                    _input_path, original_name, _extension = source
                    base = safe_output_name(
                        FilePath(original_name).stem, f"File{index}"
                    )
                    archive_name = f"{base}.pdf"
                    if archive_name.casefold() in used_names:
                        archive_name = f"{base}_{index}.pdf"
                    used_names.add(archive_name.casefold())
                    archive.write(pdf_path, arcname=archive_name)

            return send_result(
                zip_path, f"{output_name}.zip", "application/zip"
            )

        except RuntimeError as error:
            return str(error), 500
        except Exception:
            app.logger.exception("File conversion failed")
            return (
                "حدث خطأ أثناء معالجة الملفات. تحقق من الملفات وحاول مرة أخرى.",
                500,
            )


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)