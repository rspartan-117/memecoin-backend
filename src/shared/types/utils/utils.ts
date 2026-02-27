import axios from 'axios';
import {
  deleteFromSpaces,
  getFileFromSpaces,
  getSpacesUrl,
  uploadToSpaces,
} from './digitalocean';

export const models = {
  gpt4: 'gpt-4',
  gpt3: 'gpt-3.5-turbo',
  gemini: 'gemini-pro',
  dalle: 'dalle-e3',
  lora: 'lcm-lora',
  playHT: 'playHT',
  Deepgram: 'Deepgram',
  wizard: 'wizard',
};
export const type = {
  input: 'input',
  output: 'output',
};

const modelMapping = {
  mistral: 'mixtral-8x22b-instruct-v0.1@fireworks-ai',
  gpt: 'gpt-4o-2024-11-20@openai',
  claude: 'claude-3.5-sonnet@anthropic',
  router: 'router@q:1|c:4.65e-03|t:2.08e-05|i:2.07e-03',
  wizard: 'gpt-4o-mini@openai',
};

export const getFileFromBucket = getFileFromSpaces;
export const getUrl = getSpacesUrl;
export const deleteS3File = deleteFromSpaces;
export const uploadFileToSpaces = uploadToSpaces;

function getMimeType(extension: string): string {
  const mimeTypes: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
    tiff: 'image/tiff',
    webp: 'image/webp',
    html: 'text/html',
    htm: 'text/html',
    csv: 'text/csv',
    txt: 'text/plain',
    rtf: 'application/rtf',
    epub: 'application/epub+zip',
  };

  return mimeTypes[extension] || 'application/octet-stream';
}

export async function getTextFromFile(fileId: string): Promise<string> {
  const data = await getFileFromBucket(fileId, 'ogen');
  try {
    // API key
    const apiKey = process.env.LLAMA_CLOUD_API_KEY;
    if (!apiKey) {
      throw new Error('LLAMA_CLOUD_API_KEY environment variable not set');
    }

    // Common headers
    const headers = {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };
    console.log('data', data);

    // Upload file using the correct v1 endpoint
    const uploadUrl = 'https://api.cloud.llamaindex.ai/api/v1/parsing/upload';

    // Get file extension
    const fileExtension = 'pdf';
    const mimeType = getMimeType(fileExtension);

    // Create form data
    const formData = new FormData();
    formData.append(
      'file',
      new Blob([data.data as BlobPart], { type: mimeType }),
      `document.${fileExtension}`,
    );

    const uploadResponse = await axios.post(uploadUrl, formData, {
      headers: {
        ...headers,
        'Content-Type': 'multipart/form-data',
      },
    });

    const jobId = uploadResponse.data.id;

    // Poll for completion
    while (true) {
      const statusUrl = `https://api.cloud.llamaindex.ai/api/parsing/job/${jobId}`;
      const statusResponse = await axios.get(statusUrl, { headers });
      const status = statusResponse.data.status;

      if (status === 'SUCCESS') {
        const jsonUrl = `https://api.cloud.llamaindex.ai/api/parsing/job/${jobId}/result/raw/text`;
        const jsonResponse = await axios.get(jsonUrl, { headers });

        // Combine all text from pages
        console.log('jsonResponse', jsonResponse.data);
        const allText = jsonResponse.data;
        console.log('allText', allText);

        return allText;
      } else if (status === 'FAILED') {
        throw new Error('File processing job failed');
      }

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(`API request failed: ${error.message}`);
    }
    throw new Error(`Error processing file: ${error}`);
  }
}
