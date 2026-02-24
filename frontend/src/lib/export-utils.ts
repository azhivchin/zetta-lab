// ======== EXCEL ========

export async function exportToExcel(
  title: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
  fileName?: string,
) {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  // Auto-width columns
  ws["!cols"] = headers.map((h, i) => {
    const maxLen = Math.max(
      h.length,
      ...rows.map(r => String(r[i] ?? "").length),
    );
    return { wch: Math.min(Math.max(maxLen + 2, 10), 50) };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31));
  XLSX.writeFile(wb, `${fileName || title}.xlsx`);
}

// ======== PDF ========

let fontLoaded = false;

async function loadCyrillicFont(doc: InstanceType<typeof import("jspdf").default>) {
  if (fontLoaded) {
    doc.setFont("PTSans");
    return;
  }
  try {
    const res = await fetch("/fonts/PTSans-Regular.ttf");
    const buf = await res.arrayBuffer();
    const base64 = btoa(
      new Uint8Array(buf).reduce((data, byte) => data + String.fromCharCode(byte), ""),
    );
    doc.addFileToVFS("PTSans-Regular.ttf", base64);
    doc.addFont("PTSans-Regular.ttf", "PTSans", "normal");
    doc.setFont("PTSans");
    fontLoaded = true;
  } catch {
    // Fallback: use helvetica (no Cyrillic but won't crash)
    doc.setFont("helvetica");
  }
}

export async function exportToPDF(
  title: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
  fileName?: string,
) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  await loadCyrillicFont(doc);

  // Title
  doc.setFontSize(14);
  doc.text(title, 14, 15);

  // Date
  doc.setFontSize(8);
  doc.text(`Дата: ${new Date().toLocaleDateString("ru-RU")}`, 14, 21);

  // Table
  autoTable(doc, {
    startY: 25,
    head: [headers],
    body: rows.map(r => r.map(c => (c === null || c === undefined ? "—" : String(c)))),
    styles: { font: fontLoaded ? "PTSans" : "helvetica", fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { left: 14, right: 14 },
  });

  doc.save(`${fileName || title}.pdf`);
}
