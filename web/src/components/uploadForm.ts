import type { InjectionKey, Ref } from 'vue';

export interface UploadFormControl {
  prop: string;
  uploading: Readonly<Ref<boolean>>;
  validate: () => true | string;
  /** Cancel pending work and clear transient state; the parent owns its model. */
  reset: () => void;
}

export const UPLOAD_FORM_KEY: InjectionKey<{
  register: (control: UploadFormControl) => () => void;
}> = Symbol('upload-form');
