/** 只处理当前 paste 事件里的文件，不主动读取系统剪贴板或下载 HTML 图片。 */
export function clipboardImages(
  data: Pick<DataTransfer, "items" | "files"> | null,
): File[] {
  if (!data) return [];
  const images = Array.from(data.items ?? [])
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => !!file);
  return images.length
    ? images
    : Array.from(data.files ?? []).filter((file) =>
        file.type.startsWith("image/"),
      );
}

export function imageUploadError(
  file: Pick<File, "type" | "size">,
): string | null {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    return "仅支持 PNG、JPEG、WebP 图片";
  if (!file.size || file.size > 5 * 1024 * 1024)
    return "图片不能为空且不能超过 5 MB";
  return null;
}
