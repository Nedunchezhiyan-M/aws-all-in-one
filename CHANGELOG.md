# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial release of AWS Toolbox - A comprehensive toolkit for AWS operations
- **Multi-Region Management**: Automatic failover and region management for AWS services
- **IAM Policy Builder**: Programmatically build least-privilege IAM policies with templates
- **Cross-Account AssumeRole**: Secure utility for AWS cross-account role assumption
- **S3 Static Website Deployer**: Deploy static sites with CloudFront invalidation
- **S3 Utilities**: Comprehensive S3 utilities including file uploads, pre-signed URLs, S3 notifications setup, SNS topic management, and IAM policy creation
- **KMS Utilities**: Simplified encryption/decryption operations with envelope encryption
- **Unified Messaging**: Integrate EventBridge, SNS, and SQS with retries and dead-letter handling
- **Step Functions Helper**: Modern wrapper for invoking and monitoring Step Functions
- TypeScript definitions and ESM/CommonJS dual package support
- Comprehensive test suite with Jest
- GitHub Actions CI workflow
- Security-focused design with no sensitive logging

### Features
- Multi-region client management with automatic failover
- IAM policy building with fluent API and common templates
- Cross-account role assumption with comprehensive validation
- S3 deployment with CloudFront invalidation and presigned URLs
- KMS operations with encryption contexts and data key generation
- Unified messaging across AWS messaging services
- Step Functions execution management with retry patterns
- Lightweight package with minimal dependencies
- Proper resource cleanup and error handling

### Security
- No sensitive information in logs
- Input validation to prevent injection attacks
- Proper resource cleanup
- Follows AWS SDK best practices
- Support for external IDs and MFA

## [1.0.0] - 2024-01-01

### Added
- Initial release
- Core assumeRole functionality
- TypeScript support
- Comprehensive testing
- Documentation and examples
