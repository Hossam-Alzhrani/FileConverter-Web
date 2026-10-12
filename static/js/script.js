const form = document.getElementById("converterForm");
const fileInput = document.getElementById("fileInput");
const uploadArea = document.getElementById("uploadArea");
const fileNames = document.getElementById("fileNames");
const outputName = document.getElementById("outputName");
const outputMode = document.getElementById("outputMode");
const progressBar = document.getElementById("progressBar");
const status = document.getElementById("status");
const button = document.getElementById("convertButton");
const themeToggle = document.getElementById("themeToggle");

let selectedFiles = [];
let draggedIndex = null;

/* =========================
   الوضع الداكن والفاتح
========================= */

function createThemeIcon() {
    if (!themeToggle) return;

    themeToggle.innerHTML = `
        <span class="theme-icon">
            <span class="moon-shape"></span>
            <span class="sun-rays">
                <span></span><span></span>
                <span></span><span></span>
                <span></span><span></span>
                <span></span><span></span>
            </span>
        </span>
    `;
}

function updateThemeTitle() {
    if (!themeToggle) return;

    const isLight =
        document.documentElement.classList.contains("light");

    const label = isLight
        ? "تفعيل الوضع الداكن"
        : "تفعيل الوضع الفاتح";

    themeToggle.title = label;
    themeToggle.setAttribute("aria-label", label);
}

function applySavedTheme() {
    const savedTheme =
        localStorage.getItem("fileConverterTheme");

    document.documentElement.classList.toggle(
        "light",
        savedTheme === "light"
    );

    updateThemeTitle();
}

function toggleTheme() {
    const isLight =
        document.documentElement.classList.toggle("light");

    localStorage.setItem(
        "fileConverterTheme",
        isLight ? "light" : "dark"
    );

    updateThemeTitle();
}

/* =========================
   أنواع الملفات
========================= */

function getExtension(filename) {
    return filename.split(".").pop().toLowerCase();
}

function getBaseName(filename) {
    const lastDot = filename.lastIndexOf(".");

    return lastDot > 0
        ? filename.substring(0, lastDot)
        : filename;
}

function detectFilesType() {
    if (selectedFiles.length === 0) {
        return null;
    }

    const extensions = selectedFiles.map(file =>
        getExtension(file.name)
    );

    if (
        extensions.every(ext =>
            ["doc", "docx"].includes(ext)
        )
    ) {
        return "word";
    }

    if (
        extensions.every(ext =>
            ["ppt", "pptx"].includes(ext)
        )
    ) {
        return "powerpoint";
    }

    if (extensions.every(ext => ext === "pdf")) {
        return "pdf";
    }

    return "mixed";
}

function setStatus(message) {
    status.textContent = message;
}

/* =========================
   مزامنة الملفات
========================= */

function syncFileInput() {
    const dataTransfer = new DataTransfer();

    selectedFiles.forEach(file => {
        dataTransfer.items.add(file);
    });

    fileInput.files = dataTransfer.files;
}

function setFiles(files) {
    selectedFiles = Array.from(files || []);

    renderSelectedFiles();
    updateDetectedType();
}

function removeFile(index) {
    selectedFiles.splice(index, 1);

    syncFileInput();
    renderSelectedFiles();
    updateDetectedType();
}

/* =========================
   عرض الملفات وترتيبها
========================= */

function renderSelectedFiles() {
    if (selectedFiles.length === 0) {
        fileNames.textContent =
            "لم يتم اختيار أي ملفات";
    } else if (selectedFiles.length === 1) {
        fileNames.textContent =
            selectedFiles[0].name;
    } else {
        fileNames.textContent =
            `${selectedFiles.length} ملفات تم اختيارها`;
    }

    let list =
        document.getElementById("selectedFilesList");

    if (!list) {
        list = document.createElement("ol");

        list.id = "selectedFilesList";
        list.setAttribute(
            "aria-label",
            "ترتيب الملفات المختارة"
        );

        uploadArea.insertAdjacentElement(
            "afterend",
            list
        );
    }

    list.replaceChildren();
    list.hidden = selectedFiles.length === 0;

    const type = detectFilesType();
    const isPdf = type === "pdf";

    selectedFiles.forEach((file, index) => {
        const item = document.createElement("li");

        item.className = "selected-file-item";
        item.draggable = true;
        item.dataset.index = String(index);

        const grip = document.createElement("span");

        grip.className = "file-grip";
        grip.textContent = "⠿";
        grip.title = "اسحب لتغيير الترتيب";

        const name = document.createElement("span");

        name.className = "selected-file-name";
        name.textContent = file.name;
        name.title = file.name;

        const number = document.createElement("span");

        number.className = "selected-file-position";
        number.textContent = String(index + 1);

        const remove = document.createElement("button");

        remove.type = "button";
        remove.className = "remove-selected-file";
        remove.textContent = "×";
        remove.title = "إزالة الملف";
        remove.setAttribute(
            "aria-label",
            `إزالة ${file.name}`
        );

        remove.addEventListener("click", () => {
            removeFile(index);
        });

        item.append(grip, name, number, remove);

        item.addEventListener("dragstart", event => {
            draggedIndex = index;

            item.classList.add("is-dragging");

            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData(
                "text/plain",
                String(index)
            );
        });

        item.addEventListener("dragover", event => {
            event.preventDefault();

            event.dataTransfer.dropEffect = "move";

            item.classList.add("drag-over");
        });

        item.addEventListener("dragleave", () => {
            item.classList.remove("drag-over");
        });

        item.addEventListener("drop", event => {
            event.preventDefault();

            item.classList.remove("drag-over");

            const fromIndex = Number(
                event.dataTransfer.getData("text/plain")
            );

            const toIndex = Number(item.dataset.index);

            if (
                !Number.isInteger(fromIndex) ||
                fromIndex < 0 ||
                fromIndex >= selectedFiles.length ||
                fromIndex === toIndex
            ) {
                return;
            }

            const movedFile =
                selectedFiles.splice(fromIndex, 1)[0];

            selectedFiles.splice(toIndex, 0, movedFile);

            syncFileInput();
            renderSelectedFiles();
            updateDetectedType();
        });

        item.addEventListener("dragend", () => {
            draggedIndex = null;

            item.classList.remove("is-dragging");

            list.querySelectorAll(".drag-over")
                .forEach(element => {
                    element.classList.remove("drag-over");
                });
        });

        list.appendChild(item);
    });

    list.classList.toggle("pdf-order-list", isPdf);

    if (isPdf) {
        outputMode.value = "merge";
        outputMode.disabled = true;
    } else {
        outputMode.disabled = false;
    }
}

/* =========================
   حالة الملفات
========================= */

function updateDetectedType() {
    const type = detectFilesType();

    if (!type) {
        setStatus("جاهز للتحويل");
        return;
    }

    if (type === "word") {
        setStatus("تم اكتشاف ملفات Word");
        return;
    }

    if (type === "powerpoint") {
        setStatus("تم اكتشاف ملفات PowerPoint");
        return;
    }

    if (type === "pdf") {
        setStatus(
            "رتّب ملفات PDF بالسحب والإفلات، ثم ادمجها"
        );
        return;
    }

    setStatus(
        "لا يمكن خلط أنواع ملفات مختلفة في العملية نفسها"
    );
}

function getRequestedOutputName() {
    const name = outputName.value.trim();

    if (name) {
        return name;
    }

    const type = detectFilesType();

    if (type === "pdf" || outputMode.value === "merge") {
        return "Merged";
    }

    return "Converted";
}

/* =========================
   اختيار الملفات
========================= */

fileInput.addEventListener("change", () => {
    setFiles(fileInput.files);
});

uploadArea.addEventListener("dragover", event => {
    event.preventDefault();
    uploadArea.classList.add("dragging");
});

uploadArea.addEventListener("dragleave", () => {
    uploadArea.classList.remove("dragging");
});

uploadArea.addEventListener("drop", event => {
    event.preventDefault();

    uploadArea.classList.remove("dragging");

    setFiles(event.dataTransfer.files);
});

/* =========================
   إعداد الوضع
========================= */

createThemeIcon();
applySavedTheme();

if (themeToggle) {
    themeToggle.addEventListener(
        "click",
        toggleTheme
    );
}

/* =========================
   تنزيل الناتج
========================= */

function getFilenameFromResponse(response, fallback) {
    const disposition =
        response.headers.get("Content-Disposition") || "";

    const utf8Match =
        disposition.match(/filename\*=UTF-8''([^;]+)/i);

    if (utf8Match) {
        try {
            return decodeURIComponent(utf8Match[1]);
        } catch (_error) {
            return fallback;
        }
    }

    const normalMatch =
        disposition.match(/filename="?([^";]+)"?/i);

    return normalMatch
        ? normalMatch[1]
        : fallback;
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 3000);
}

/* =========================
   إرسال الملفات للمعالجة
========================= */

form.addEventListener("submit", async event => {
    event.preventDefault();

    if (selectedFiles.length === 0) {
        setStatus("اختر ملفًا أولًا");
        return;
    }

    const type = detectFilesType();

    if (type === "mixed") {
        setStatus(
            "اختر ملفات من النوع نفسه في كل عملية"
        );
        return;
    }

    if (type === "pdf" && selectedFiles.length < 2) {
        setStatus("اختر ملفي PDF على الأقل لدمجهما");
        return;
    }

    const mode =
        type === "pdf"
            ? "merge"
            : outputMode.value;

    const formData = new FormData();

    /*
      تُرسل الملفات بنفس ترتيب القائمة المرئية.
      لذلك يستطيع الخادم دمج PDF بالترتيب نفسه.
    */
    selectedFiles.forEach(file => {
        formData.append("files", file, file.name);
    });

    formData.append("outputMode", mode);

    formData.append(
        "outputName",
        getRequestedOutputName()
    );

    button.disabled = true;
    button.textContent = "جاري المعالجة...";

    progressBar.style.width = "5%";

    if (type === "pdf") {
        setStatus("جاري دمج ملفات PDF بالترتيب المحدد...");
    } else if (type === "word") {
        setStatus("جاري تحويل ملفات Word إلى PDF...");
    } else {
        setStatus(
            "جاري تحويل ملفات PowerPoint إلى PDF..."
        );
    }

    let progress = 5;

    const progressInterval = setInterval(() => {
        if (progress < 90) {
            progress += Math.max(
                0.4,
                (90 - progress) * 0.075
            );

            progress = Math.min(progress, 90);

            progressBar.style.width =
                `${progress}%`;
        }
    }, 180);

    try {
        const response = await fetch("/convert", {
            method: "POST",
            body: formData
        });

        clearInterval(progressInterval);

        if (!response.ok) {
            const message = await response.text();

            throw new Error(
                message || "تعذرت معالجة الملفات."
            );
        }

        const blob = await response.blob();

        const fallbackName =
            type === "pdf" || mode === "merge"
                ? `${getRequestedOutputName()}.pdf`
                : selectedFiles.length > 1
                    ? `${getRequestedOutputName()}.zip`
                    : `${getBaseName(selectedFiles[0].name)}.pdf`;

        const filename = getFilenameFromResponse(
            response,
            fallbackName
        );

        progressBar.style.width = "100%";

        downloadBlob(blob, filename);

        setStatus(
            "تمت المعالجة بنجاح، وبدأ تنزيل الناتج"
        );

    } catch (error) {
        clearInterval(progressInterval);

        progressBar.style.width = "0%";

        setStatus(
            error.message || "حدث خطأ أثناء المعالجة."
        );

    } finally {
        button.disabled = false;
        button.textContent = "تحويل الملفات";

        setTimeout(() => {
            progressBar.style.width = "0%";
        }, 1400);
    }
});