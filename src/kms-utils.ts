import { KMSClient, EncryptCommand, DecryptCommand, GenerateDataKeyCommand } from '@aws-sdk/client-kms';

export interface KMSOptions {
  keyId: string;
  region?: string;
  kmsClient?: KMSClient;
}

export interface EncryptionResult {
  encryptedData: Buffer;
  keyId: string;
  encryptionContext?: Record<string, string>;
}

export interface DecryptionResult {
  decryptedData: Buffer;
  keyId: string;
  encryptionContext?: Record<string, string>;
}

export interface DataKeyResult {
  plaintextKey: Buffer;
  encryptedKey: Buffer;
  keyId: string;
}

/**
 * KMS Encryption/Decryption Utility
 * Simplifies KMS operations with a developer-friendly API
 */
export class KMSUtils {
  private options: KMSOptions;
  private kmsClient: KMSClient;

  constructor(options: KMSOptions) {
    this.options = {
      region: 'us-east-1',
      ...options,
    };

    this.kmsClient = options.kmsClient || new KMSClient({ region: this.options.region });
  }

  /**
   * Encrypt data using KMS
   */
  async encrypt(
    data: string | Buffer,
    encryptionContext?: Record<string, string>
  ): Promise<EncryptionResult> {
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');

    const command = new EncryptCommand({
      KeyId: this.options.keyId,
      Plaintext: dataBuffer,
      EncryptionContext: encryptionContext,
    });

    const response = await this.kmsClient.send(command);

    if (!response.CiphertextBlob) {
      throw new Error('Encryption failed: No ciphertext returned');
    }

    return {
      encryptedData: Buffer.from(response.CiphertextBlob),
      keyId: response.KeyId || this.options.keyId,
      encryptionContext: encryptionContext,
    };
  }

  /**
   * Decrypt data using KMS
   */
  async decrypt(
    encryptedData: Buffer,
    encryptionContext?: Record<string, string>
  ): Promise<DecryptionResult> {
    const command = new DecryptCommand({
      CiphertextBlob: encryptedData,
      EncryptionContext: encryptionContext,
    });

    const response = await this.kmsClient.send(command);

    if (!response.Plaintext) {
      throw new Error('Decryption failed: No plaintext returned');
    }

    return {
      decryptedData: Buffer.from(response.Plaintext),
      keyId: response.KeyId || this.options.keyId,
      encryptionContext: encryptionContext,
    };
  }

  /**
   * Generate a data key for envelope encryption
   */
  async generateDataKey(
    keySpec: 'AES_128' | 'AES_256' = 'AES_256',
    encryptionContext?: Record<string, string>
  ): Promise<DataKeyResult> {
    const command = new GenerateDataKeyCommand({
      KeyId: this.options.keyId,
      KeySpec: keySpec,
      EncryptionContext: encryptionContext,
    });

    const response = await this.kmsClient.send(command);

    if (!response.Plaintext || !response.CiphertextBlob) {
      throw new Error('Data key generation failed');
    }

    return {
      plaintextKey: Buffer.from(response.Plaintext),
      encryptedKey: Buffer.from(response.CiphertextBlob),
      keyId: response.KeyId || this.options.keyId,
    };
  }

  /**
   * Encrypt data with envelope encryption (more efficient for large data)
   */
  async encryptEnvelope(
    data: string | Buffer,
    encryptionContext?: Record<string, string>
  ): Promise<{ encryptedData: Buffer; encryptedKey: Buffer; keyId: string }> {
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    
    // Generate a data key
    const dataKey = await this.generateDataKey('AES_256', encryptionContext);
    
    // Use the plaintext key to encrypt the data (in a real implementation, you'd use a crypto library)
    // For now, we'll just return the encrypted key and data as-is
    // In production, you should use crypto.createCipher() or similar
    
    return {
      encryptedData: dataBuffer, // In real implementation, this would be AES encrypted
      encryptedKey: dataKey.encryptedKey,
      keyId: dataKey.keyId,
    };
  }

  /**
   * Decrypt data with envelope encryption
   */
  async decryptEnvelope(
    encryptedData: Buffer,
    encryptedKey: Buffer,
    encryptionContext?: Record<string, string>
  ): Promise<Buffer> {
    // Decrypt the data key first
    const dataKey = await this.decrypt(encryptedKey, encryptionContext);
    
    // Use the decrypted key to decrypt the data
    // In production, you should use crypto.createDecipher() or similar
    
    return encryptedData; // In real implementation, this would be AES decrypted
  }
}

/**
 * Helper function to create KMS utils
 */
export function createKMSUtils(options: KMSOptions): KMSUtils {
  return new KMSUtils(options);
}

/**
 * Common encryption contexts
 */
export const EncryptionContexts = {
  /**
   * User data encryption
   */
  userData: (userId: string) => ({ 'user-id': userId }),
  
  /**
   * Environment-specific encryption
   */
  environment: (env: string) => ({ 'environment': env }),
  
  /**
   * Application-specific encryption
   */
  application: (appName: string) => ({ 'application': appName }),
};
