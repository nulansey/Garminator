// Downscale an image File to a JPEG base64 string (no data: prefix),
// max 1024px on the long edge, quality 0.8.
export function resizeImage(file, maxEdge = 1024) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
      URL.revokeObjectURL(img.src);
      resolve(dataUrl.split(",")[1]); // strip "data:image/jpeg;base64,"
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
