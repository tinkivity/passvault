export interface VaultSummary {
  vaultId: string;
  displayName: string;
  createdAt: string;
  encryptionSalt: string;
}

export interface CreateVaultRequest {
  displayName: string;
  source?: 'import';
}

export interface RenameVaultRequest {
  displayName: string;
}

export interface VaultGetResponse {
  encryptedIndex: string;
  encryptedItems: string;
  lastModified: string;
}

export interface VaultGetIndexResponse {
  encryptedIndex: string;
  lastModified: string;
}

export interface VaultGetItemsResponse {
  encryptedItems: string;
  lastModified: string;
}

export interface VaultPutRequest {
  encryptedIndex: string;
  encryptedItems: string;
}

export interface VaultPutResponse {
  success: boolean;
  lastModified: string;
}

export interface VaultDownloadResponse {
  encryptedIndex: string;
  encryptedItems: string;
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
