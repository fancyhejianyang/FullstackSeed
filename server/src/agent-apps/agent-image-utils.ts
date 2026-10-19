// 保留既有调用契约；图片校验与安全下载不再绑定 Agent。
export {
  IMAGE_UPLOAD_LIMIT as AGENT_UPLOAD_LIMIT,
  IMAGE_LIMIT as AGENT_IMAGE_LIMIT,
  imageMime,
  isPublicImageAddress,
  downloadGeneratedImage,
  readMediaJson,
} from '../common/ai/image-utils';
