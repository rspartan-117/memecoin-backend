# Batch Upload Implementation

## Overview

This document describes the batch upload functionality for documents in the NestJS backend, which integrates with the Python backend's optimized batch processing endpoint.

## Architecture

### Flow

```
Client → NestJS Controller → NestJS Service → S3 Upload (parallel) → Python API (batch) → Store Metadata
```

### Key Features

1. **Parallel S3 Upload**: All files are uploaded to S3 simultaneously for maximum performance
2. **Optimized Python Processing**: Uses Python's `/assets/process-documents` endpoint which:
   - Groups documents by loader type (LlamaParse vs text)
   - Processes groups in parallel
   - Single API call for LlamaParse documents (80% cost reduction)
   - 4x faster than sequential processing
3. **Partial Success Handling**: Continues processing even if some documents fail
4. **Comprehensive Logging**: Detailed logging at every step for debugging

## Implementation Details

### 1. DTOs

**File**: `src/projects/dtos/batch-upload.dto.ts`

#### `BatchDocumentResultDto`
Individual document result with all processing metadata:
- `success`: Whether processing succeeded
- `asset_id`: Unique asset identifier
- `filename`: Original filename
- `s3_url`: S3 storage URL
- `file_type`: File extension
- `language`: Programming language (for code files)
- `is_code_file`: Boolean flag
- `summary`: AI-generated document summary
- `total_chunks`: Number of RAG chunks created
- `token_count`: Total token count
- `rag_processed`: RAG embedding completion status
- `error`: Error message (if failed)
- `message`: Result message

#### `BatchUploadDocumentsResponseDto`
Aggregated batch response:
- `success`: True if at least one document succeeded
- `total_documents`: Total number of documents
- `successful`: Count of successful documents
- `failed`: Count of failed documents
- `results`: Array of individual results
- `message`: Overall message

### 2. Service Methods

**File**: `src/projects/services/assets.service.ts`

#### `uploadDocumentsBatch(projectId, userId, files)`

**Steps**:

1. **Validate Input**: Ensure files array is not empty
2. **Parallel S3 Upload**: Upload all files to S3 simultaneously using `Promise.all()`
3. **Prepare Payload**: Create DocInfo objects with S3 URLs
4. **Call Python API**: POST to `/assets/process-documents` with batch payload
5. **Store Metadata**: Save successful results to PostgreSQL `Project.metadata.documents[]`
6. **Return Results**: Return aggregated response with success/failure counts

**Error Handling**:
- Catches and logs detailed error information
- Includes HTTP response status, data, and headers
- Throws HttpException with appropriate status code

#### `processBatchDocuments(payload)` (private)

Calls Python API's batch endpoint and handles the response.

**Payload Structure**:
```typescript
{
  documents: [
    {
      filename: string,
      filetype: string,
      metadata: {
        file_size: number,
        uploaded_at: string
      },
      public_url: string
    }
  ],
  project_id: string,
  user_id: string
}
```

### 3. Controller Endpoint

**File**: `src/projects/controllers/assets.controller.ts`

#### `POST /projects/:projectId/assets/documents/batch`

**Request**:
- Method: `POST`
- Content-Type: `multipart/form-data`
- Field name: `files` (array)
- Max files: 50 per batch
- Authentication: JWT Bearer token required

**Response**:
```typescript
{
  success: boolean,
  total_documents: number,
  successful: number,
  failed: number,
  results: BatchDocumentResultDto[],
  message: string
}
```

**Swagger Documentation**:
- Operation: "Batch upload documents"
- Description: "Upload and process multiple documents at once (optimized for performance)"
- Comprehensive logging for debugging

## Usage Examples

### cURL Example

```bash
curl -X POST \
  'http://localhost:3000/projects/proj_abc123/assets/documents/batch' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -F 'files=@document1.pdf' \
  -F 'files=@script.py' \
  -F 'files=@readme.md' \
  -F 'files=@data.csv'
```

### JavaScript/TypeScript Example

```typescript
const formData = new FormData();
files.forEach(file => {
  formData.append('files', file);
});

const response = await fetch(
  `${API_URL}/projects/${projectId}/assets/documents/batch`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  }
);

const result = await response.json();
console.log(`${result.successful}/${result.total_documents} documents processed`);
```

### React Hook Example

```typescript
const uploadBatchDocuments = async (projectId: string, files: File[]) => {
  const formData = new FormData();
  files.forEach(file => formData.append('files', file));

  try {
    const response = await fetch(
      `/projects/${projectId}/assets/documents/batch`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      }
    );

    const result = await response.json();

    if (result.success) {
      toast.success(
        `${result.successful}/${result.total_documents} documents uploaded`
      );
    } else {
      toast.error('All documents failed to upload');
    }

    return result;
  } catch (error) {
    toast.error('Failed to upload documents');
    throw error;
  }
};
```

## Performance Benefits

### Single Upload (Sequential)
- 5 documents × 15 seconds each = **75 seconds**
- 5 separate API calls to Python
- Higher LlamaParse costs (individual calls)

### Batch Upload (Parallel + Optimized)
- 5 documents processed in parallel = **~20 seconds**
- 1 API call to Python (batch)
- 80% cost reduction for LlamaParse
- **~4x faster**

## Error Handling

### Partial Failures

The batch endpoint is designed to handle partial failures gracefully:

1. **S3 Upload Failure**: If any file fails to upload to S3, the entire batch fails
2. **Python Processing Failure**: Individual document failures don't stop the batch
3. **Metadata Storage**: Only successful documents are stored in the database

### Example Response (Partial Success)

```json
{
  "success": true,
  "total_documents": 5,
  "successful": 4,
  "failed": 1,
  "results": [
    {
      "success": true,
      "asset_id": "asset_abc123",
      "filename": "doc1.pdf",
      "rag_processed": true,
      ...
    },
    {
      "success": false,
      "asset_id": "asset_def456",
      "filename": "corrupted.pdf",
      "error": "Failed to parse PDF: file is corrupted",
      "rag_processed": false,
      ...
    },
    ...
  ],
  "message": "Batch processing complete: 4/5 documents processed successfully"
}
```

## Integration with Chat

The batch-uploaded documents are automatically available in chat contexts:

1. **Metadata Storage**: Documents are stored in `Project.metadata.documents[]`
2. **RAG Integration**: Embeddings are stored in MongoDB by Python backend
3. **Chat Extraction**: Chat controller extracts document context from metadata
4. **Context Passing**: Document summaries are passed to Python chat endpoint

**See**: `src/projects/controllers/chat.controller.ts:101-116`

## Logging

### Debug Logs

```
[AssetsService] Batch uploading 5 documents for project proj_abc123
[AssetsService] Uploading 5 files to S3 in parallel...
[AssetsService] All 5 files uploaded to S3
[AssetsService] Sending batch processing request to Python API with 5 documents
[AssetsService] Batch result: 4/5 successful
[AssetsService] Batch upload complete: 4/5 documents processed
```

### Error Logs

```
[AssetsService] Error in batch document upload: Connection timeout
[AssetsService] Response status: 504
[AssetsService] Response data: { "message": "Gateway timeout" }
```

## Testing

### Unit Tests (Recommended)

```typescript
describe('AssetsService - Batch Upload', () => {
  it('should upload multiple documents in parallel', async () => {
    const files = [mockFile1, mockFile2, mockFile3];
    const result = await service.uploadDocumentsBatch('proj_123', 'user_456', files);

    expect(result.success).toBe(true);
    expect(result.total_documents).toBe(3);
    expect(result.successful).toBe(3);
  });

  it('should handle partial failures', async () => {
    const files = [mockValidFile, mockCorruptedFile];
    const result = await service.uploadDocumentsBatch('proj_123', 'user_456', files);

    expect(result.success).toBe(true);
    expect(result.successful).toBe(1);
    expect(result.failed).toBe(1);
  });
});
```

### Integration Tests

```bash
# Test batch upload endpoint
npm run test:e2e -- --testNamePattern="batch upload"
```

## Future Enhancements

1. **Progress Tracking**: Add WebSocket support for real-time progress updates
2. **Retry Logic**: Automatic retry for failed documents
3. **File Validation**: Pre-upload validation (size, type, virus scan)
4. **Chunked Upload**: Support for very large files with resume capability
5. **Batch Delete**: Add endpoint to delete multiple assets at once

## Related Files

- **Controller**: `src/projects/controllers/assets.controller.ts`
- **Service**: `src/projects/services/assets.service.ts`
- **DTOs**: `src/projects/dtos/batch-upload.dto.ts`
- **Python Endpoint**: Python backend `/assets/process-documents`
- **Chat Integration**: `src/projects/controllers/chat.controller.ts`

## API Documentation

Swagger documentation is automatically generated and available at:
- **Local**: `http://localhost:3000/api`
- **Endpoint**: `POST /projects/:projectId/assets/documents/batch`
- **Tag**: "Projects - Assets"
