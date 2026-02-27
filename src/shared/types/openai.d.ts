export type OPENAI_MESSAGE_TYPE = {
  role: 'system' | 'user' | 'assistant';
  content: string;
}[];

interface AudioFile {
  id: string;
  mimeType: string;
}

export interface OtherFileList {
  // example file list - [{id: '123', mimeType: 'audio/mp3'}, {id: '456', mimeType: 'audio/mp3'}]
  files: OtherFile[];
}

interface OtherFile {
  id: string;
  mimeType: string;
}

export type BucketName = 'privatex' | 'ogen' | 'ominx';
