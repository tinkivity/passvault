export interface VaultGetResponse {
  encryptedContent: string;
  lastModified: string;
}

export interface VaultPutRequest {
  encryptedContent: string;
}

export interface VaultPutResponse {
  success: boolean;
  lastModified: string;
}

export interface VaultDownloadResponse {
  encryptedContent: string;
  encryptionSalt: string;
  algorithm: string;
  parameters: {
    argon2: {
      memory: number;
      iterations: number;
      parallelism: number;
      hashLength: number;
    };
    aes: {
      keySize: number;
      ivSize: number;
      tagSize: number;
    };
  };
  lastModified: string;
  username: string;
}
