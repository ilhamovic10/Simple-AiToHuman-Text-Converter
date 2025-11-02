// Add declarations for global libraries from CDN
declare const mammoth: any;
declare let pdfjsLib: any;
declare const jspdf: any;
declare const docx: any;


// --- PARSING ---

export const parseDocxFile = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (event) => {
            if (event.target?.result) {
                try {
                    const result = await mammoth.extractRawText({ arrayBuffer: event.target.result });
                    resolve(result.value);
                } catch (error) {
                    console.error("Error parsing DOCX:", error);
                    reject('Failed to parse DOCX file.');
                }
            }
        };
        reader.onerror = () => reject('Failed to read file.');
        reader.readAsArrayBuffer(file);
    });
};

export const parsePdfFile = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (event) => {
            if (event.target?.result) {
                try {
                    // This is required for the modular script
                    if (typeof pdfjsLib === 'function') {
                       pdfjsLib = await (pdfjsLib as any)();
                    }
                    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
                        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs`;
                    }
                    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(event.target.result as ArrayBuffer) }).promise;
                    let textContent = '';
                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const text = await page.getTextContent();
                        textContent += text.items.map((s: any) => s.str).join(' ');
                        if (i < pdf.numPages) {
                           textContent += '\n\n'; // Add space between pages
                        }
                    }
                    resolve(textContent.trim());
                } catch (error) {
                    console.error("Error parsing PDF:", error);
                    reject('Failed to parse PDF file.');
                }
            }
        };
        reader.onerror = () => reject('Failed to read file.');
        reader.readAsArrayBuffer(file);
    });
};


// --- GENERATION & DOWNLOAD ---
const saveFile = (blob: Blob, filename: string) => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
};

export const downloadDocxFile = async (text: string, filename: string) => {
    const doc = new docx.Document({
        sections: [{
            children: text.split('\n').map(p => new docx.Paragraph({ text: p })),
        }],
    });

    try {
        const blob = await docx.Packer.toBlob(doc);
        saveFile(blob, `${filename}.docx`);
    } catch (error) {
        console.error("Error generating DOCX:", error);
        throw new Error('Failed to generate DOCX file.');
    }
};

export const downloadPdfFile = (text: string, filename: string) => {
    try {
        const { jsPDF } = jspdf;
        const doc = new jsPDF();
        
        // A4 page is 210mm wide, with 10mm margins on each side -> 190mm usable width
        const lines = doc.splitTextToSize(text, 190);
        doc.text(lines, 10, 10);

        doc.save(`${filename}.pdf`);
    } catch (error) {
        console.error("Error generating PDF:", error);
        throw new Error('Failed to generate PDF file.');
    }
};