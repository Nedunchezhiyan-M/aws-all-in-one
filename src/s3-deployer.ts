import { S3Client, PutObjectCommand, PutBucketWebsiteCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as mime from 'mime-types';
import * as fs from 'fs';
import * as path from 'path';

export interface S3DeployerOptions {
  bucketName: string;
  sourcePath: string;
  region?: string;
  cloudFrontDistributionId?: string;
  cacheControl?: string;
  acl?: string;
  s3Client?: S3Client;
  cloudFrontClient?: CloudFrontClient;
}

export interface DeployResult {
  uploadedFiles: string[];
  totalSize: number;
  cloudFrontInvalidationId?: string;
}

/**
 * S3 Static Website Deployer
 * Syncs files to S3, configures static website hosting, and invalidates CloudFront
 */
export class S3Deployer {
  private options: S3DeployerOptions;
  private s3Client: S3Client;
  private cloudFrontClient?: CloudFrontClient;

  constructor(options: S3DeployerOptions) {
    this.options = {
      region: 'us-east-1',
      cacheControl: 'public, max-age=3600',
      acl: 'public-read',
      ...options,
    };

    this.s3Client = options.s3Client || new S3Client({ region: this.options.region });
    this.cloudFrontClient = options.cloudFrontClient || 
      (options.cloudFrontDistributionId ? new CloudFrontClient({ region: this.options.region }) : undefined);
  }

  /**
   * Deploy files to S3
   */
  async deploy(): Promise<DeployResult> {
    const files = this.getFilesToUpload();
    const uploadedFiles: string[] = [];
    let totalSize = 0;

    // Upload each file
    for (const file of files) {
      const key = this.getS3Key(file);
      const content = fs.readFileSync(file);
      const contentType = mime.lookup(file) || 'application/octet-stream';

      await this.s3Client.send(new PutObjectCommand({
        Bucket: this.options.bucketName,
        Key: key,
        Body: content,
        ContentType: contentType,
                         CacheControl: this.options.cacheControl,
                 ACL: this.options.acl as any,
      }));

      uploadedFiles.push(key);
      totalSize += content.length;
    }

    // Configure static website hosting
    await this.configureStaticWebsite();

    // Invalidate CloudFront if distribution ID is provided
    let cloudFrontInvalidationId: string | undefined;
    if (this.options.cloudFrontDistributionId && this.cloudFrontClient) {
      cloudFrontInvalidationId = await this.invalidateCloudFront();
    }

    return {
      uploadedFiles,
      totalSize,
      cloudFrontInvalidationId,
    };
  }

  /**
   * Get all files to upload
   */
  private getFilesToUpload(): string[] {
    const files: string[] = [];
    
    if (fs.statSync(this.options.sourcePath).isDirectory()) {
      this.walkDirectory(this.options.sourcePath, files);
    } else {
      files.push(this.options.sourcePath);
    }

    return files;
  }

  /**
   * Walk directory recursively
   */
  private walkDirectory(dir: string, files: string[]): void {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        this.walkDirectory(fullPath, files);
      } else {
        files.push(fullPath);
      }
    }
  }

  /**
   * Get S3 key for a file
   */
  private getS3Key(filePath: string): string {
    const relativePath = path.relative(this.options.sourcePath, filePath);
    return relativePath.replace(/\\/g, '/'); // Convert Windows paths to Unix
  }

  /**
   * Configure static website hosting
   */
  private async configureStaticWebsite(): Promise<void> {
    try {
      await this.s3Client.send(new PutBucketWebsiteCommand({
        Bucket: this.options.bucketName,
        WebsiteConfiguration: {
          IndexDocument: { Suffix: 'index.html' },
          ErrorDocument: { Key: 'error.html' },
        },
      }));
    } catch (error) {
      // Ignore if website configuration already exists
      console.warn('Could not configure static website hosting:', error);
    }
  }

  /**
   * Invalidate CloudFront distribution
   */
  private async invalidateCloudFront(): Promise<string> {
    if (!this.cloudFrontClient || !this.options.cloudFrontDistributionId) {
      throw new Error('CloudFront client or distribution ID not configured');
    }

    const response = await this.cloudFrontClient.send(new CreateInvalidationCommand({
      DistributionId: this.options.cloudFrontDistributionId,
      InvalidationBatch: {
        Paths: {
          Quantity: 1,
          Items: ['/*'],
        },
        CallerReference: `deploy-${Date.now()}`,
      },
    }));

    return response.Invalidation?.Id || '';
  }

  /**
   * Generate presigned URL for a file
   */
  async generatePresignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.options.bucketName,
      Key: key,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn });
  }
}

/**
 * Helper function to create a deployer
 */
export function createS3Deployer(options: S3DeployerOptions): S3Deployer {
  return new S3Deployer(options);
}
