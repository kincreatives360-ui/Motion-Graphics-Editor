/**
 * Helper to trigger a browser download for a generated Blob.
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // Clean up object URL after download trigger
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 10000);
}
