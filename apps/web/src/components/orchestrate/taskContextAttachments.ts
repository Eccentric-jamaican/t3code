import {
  PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
  type ChatAttachment as ContractChatAttachment,
  type UploadChatAttachment,
} from "@t3tools/contracts";

export const TASK_CONTEXT_IMAGE_SIZE_LIMIT_LABEL = `${Math.round(
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES / (1024 * 1024),
)}MB`;

export type TaskDraftImageAttachment = {
  type: "image";
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  previewUrl?: string;
  file?: File;
};

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Could not read image data."));
    });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("Failed to read image."));
    });
    reader.readAsDataURL(file);
  });
}

export function createTaskDraftImageAttachments(input: {
  readonly files: ReadonlyArray<File>;
  readonly existingCount: number;
}): {
  readonly attachments: Array<TaskDraftImageAttachment>;
  readonly error: string | null;
} {
  const attachments: Array<TaskDraftImageAttachment> = [];
  let nextImageCount = input.existingCount;
  let error: string | null = null;

  for (const file of input.files) {
    if (!file.type.startsWith("image/")) {
      error = `Unsupported file type for '${file.name}'. Please attach image files only.`;
      continue;
    }
    if (file.size > PROVIDER_SEND_TURN_MAX_IMAGE_BYTES) {
      error = `'${file.name}' exceeds the ${TASK_CONTEXT_IMAGE_SIZE_LIMIT_LABEL} attachment limit.`;
      continue;
    }
    if (nextImageCount >= PROVIDER_SEND_TURN_MAX_ATTACHMENTS) {
      error = `You can attach up to ${PROVIDER_SEND_TURN_MAX_ATTACHMENTS} images per task.`;
      break;
    }

    attachments.push({
      type: "image",
      id: crypto.randomUUID(),
      name: file.name || "image",
      mimeType: file.type,
      sizeBytes: file.size,
      previewUrl: URL.createObjectURL(file),
      file,
    });
    nextImageCount += 1;
  }

  return { attachments, error };
}

export async function toTaskCommandAttachments(
  attachments: ReadonlyArray<TaskDraftImageAttachment>,
): Promise<Array<ContractChatAttachment | UploadChatAttachment>> {
  return Promise.all(
    attachments.map(async (attachment) => {
      if (attachment.file) {
        return {
          type: "image" as const,
          name: attachment.name,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          dataUrl: await readFileAsDataUrl(attachment.file),
        };
      }

      return {
        type: "image" as const,
        id: attachment.id,
        name: attachment.name,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
      };
    }),
  );
}

export function cloneTaskDraftImageAttachment(
  attachment: TaskDraftImageAttachment,
): TaskDraftImageAttachment {
  return {
    type: "image",
    id: attachment.id,
    name: attachment.name,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    ...(attachment.previewUrl ? { previewUrl: attachment.previewUrl } : {}),
    ...(attachment.file ? { file: attachment.file } : {}),
  };
}

export function cloneTaskDraftImageAttachments(
  attachments: ReadonlyArray<TaskDraftImageAttachment>,
): Array<TaskDraftImageAttachment> {
  return attachments.map(cloneTaskDraftImageAttachment);
}

export function taskDraftAttachmentsFromTask(
  attachments: ReadonlyArray<{
    type: "image";
    id: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
    previewUrl?: string;
  }>,
): Array<TaskDraftImageAttachment> {
  return attachments.map((attachment) => ({
    type: "image",
    id: attachment.id,
    name: attachment.name,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    ...(attachment.previewUrl ? { previewUrl: attachment.previewUrl } : {}),
  }));
}

export function revokeTaskDraftAttachmentPreviewUrl(
  attachment: Pick<TaskDraftImageAttachment, "previewUrl">,
): void {
  if (!attachment.previewUrl?.startsWith("blob:")) {
    return;
  }
  URL.revokeObjectURL(attachment.previewUrl);
}

export function revokeTaskDraftAttachmentPreviewUrls(
  attachments: ReadonlyArray<Pick<TaskDraftImageAttachment, "previewUrl">>,
): void {
  for (const attachment of attachments) {
    revokeTaskDraftAttachmentPreviewUrl(attachment);
  }
}
