# PassVault - File Recovery Manual

## Overview

This manual explains how to decrypt your PassVault encrypted file **independently** using only your login password. This allows you to recover your data even without access to the PassVault application.

**What you need:**
1. Your encrypted backup file (downloaded from PassVault)
2. Your login password

**Security Note:** This recovery process does NOT weaken security. Your encrypted file is useless without your password, and this capability gives you full control and ownership of your data.

---

## Table of Contents

1. [Downloading Your Encrypted Backup](#1-downloading-your-encrypted-backup)
2. [Understanding the Backup File Format](#2-understanding-the-backup-file-format)
3. [Manual Decryption Methods](#3-manual-decryption-methods)
   - [Method A: Using Python Script (Recommended)](#method-a-using-python-script-recommended)
   - [Method B: Using OpenSSL + Custom Tools](#method-b-using-openssl--custom-tools)
   - [Method C: Using Node.js Script](#method-c-using-nodejs-script)
4. [Troubleshooting](#4-troubleshooting)
5. [Technical Details](#5-technical-details)

---

## 1. Downloading Your Encrypted Backup

**From the PassVault Application:**

1. Log in to PassVault with your username, password, and TOTP code
2. You will see your vault in **View Mode**
3. Click the **"Download Encrypted Backup"** button
4. Save the file as `passvault-backup.json`

**Backup File Contents:**
```json
{
  "encryptedContent": "base64-encoded-encrypted-data",
  "encryptionSalt": "base64-encoded-salt",
  "algorithm": "argon2id+aes-256-gcm",
  "parameters": {
    "argon2": {
      "memory": 65536,
      "iterations": 3,
      "parallelism": 4,
      "hashLength": 32
    },
    "aes": {
      "keySize": 256,
      "ivSize": 96,
      "tagSize": 128
    }
  },
  "username": "your-username",
  "lastModified": "2026-02-14T12:34:56Z"
}
```

---

## 2. Understanding the Backup File Format

Your backup file contains:

- **`encryptedContent`**: Your encrypted file data in base64 format
  - Format: `[IV (12 bytes) || Ciphertext || Authentication Tag (16 bytes)]`
- **`encryptionSalt`**: Unique salt used to derive your encryption key from your password
- **`algorithm`**: Encryption algorithms used (Argon2id for key derivation, AES-256-GCM for encryption)
- **`parameters`**: Exact parameters needed for decryption
- **`username`**: Your username (for reference)
- **`lastModified`**: When the file was last updated

**Decryption Process:**
1. Derive encryption key from password using Argon2id + salt
2. Decode encrypted content from base64
3. Extract IV (first 12 bytes), ciphertext, and tag (last 16 bytes)
4. Decrypt ciphertext using AES-256-GCM with derived key and IV

---

## 3. Manual Decryption Methods

### Method A: Using Python Script (Recommended)

**Prerequisites:**
- Python 3.8 or higher
- `pip` package manager

**Step 1: Install Required Libraries**
```bash
pip install argon2-cffi cryptography
```

**Step 2: Create Decryption Script**

Save the following as `decrypt_passvault.py`:

```python
#!/usr/bin/env python3
import json
import base64
import getpass
from argon2 import low_level
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def decrypt_passvault_file(backup_file_path, password):
    """Decrypt a PassVault backup file using the user's password."""

    # Load backup file
    with open(backup_file_path, 'r') as f:
        backup = json.load(f)

    print(f"Loaded backup for user: {backup['username']}")
    print(f"Last modified: {backup['lastModified']}")

    # Extract parameters
    salt = base64.b64decode(backup['encryptionSalt'])
    encrypted_data = base64.b64decode(backup['encryptedContent'])
    params = backup['parameters']['argon2']

    # Derive encryption key from password using Argon2id
    print("\nDeriving encryption key from password (this may take a few seconds)...")
    encryption_key = low_level.hash_secret_raw(
        secret=password.encode('utf-8'),
        salt=salt,
        time_cost=params['iterations'],
        memory_cost=params['memory'],
        parallelism=params['parallelism'],
        hash_len=params['hashLength'],
        type=low_level.Type.ID  # Argon2id
    )
    print("✓ Key derived successfully")

    # Extract IV, ciphertext, and tag from encrypted data
    # Format: [IV (12 bytes) || Ciphertext || Tag (16 bytes)]
    iv = encrypted_data[:12]
    ciphertext_with_tag = encrypted_data[12:]

    # Decrypt using AES-256-GCM
    print("Decrypting file content...")
    try:
        aesgcm = AESGCM(encryption_key)
        plaintext = aesgcm.decrypt(iv, ciphertext_with_tag, None)
        print("✓ Decryption successful!\n")

        # Return decrypted text
        return plaintext.decode('utf-8')

    except Exception as e:
        print(f"✗ Decryption failed: {e}")
        print("\nPossible reasons:")
        print("  - Incorrect password")
        print("  - Corrupted backup file")
        print("  - Tampered encrypted content")
        return None

def main():
    print("=" * 60)
    print("PassVault File Recovery Tool")
    print("=" * 60)
    print()

    # Get backup file path
    backup_file = input("Enter path to backup file (passvault-backup.json): ").strip()
    if not backup_file:
        backup_file = "passvault-backup.json"

    # Get password
    password = getpass.getpass("Enter your PassVault login password: ")

    print()

    # Decrypt
    plaintext = decrypt_passvault_file(backup_file, password)

    if plaintext:
        print("-" * 60)
        print("DECRYPTED CONTENT:")
        print("-" * 60)
        print(plaintext)
        print("-" * 60)

        # Optionally save to file
        save = input("\nSave decrypted content to file? (y/n): ").strip().lower()
        if save == 'y':
            output_file = input("Output filename (decrypted.txt): ").strip() or "decrypted.txt"
            with open(output_file, 'w') as f:
                f.write(plaintext)
            print(f"✓ Saved to {output_file}")
    else:
        print("\nDecryption failed. Please check your password and try again.")
        exit(1)

if __name__ == "__main__":
    main()
```

**Step 3: Run the Script**
```bash
python decrypt_passvault.py
```

**Step 4: Enter Your Information**
- Path to backup file (or press Enter for default `passvault-backup.json`)
- Your PassVault login password

**Step 5: View or Save Decrypted Content**
- The script will display your decrypted content
- Optionally save it to a text file

---

### Method B: Using OpenSSL + Custom Tools

**Prerequisites:**
- OpenSSL command-line tool
- `argon2` CLI tool
- `base64` utility

**This method is more complex and requires manual hex/binary manipulation. We recommend Method A (Python) or Method C (Node.js) instead.**

---

### Method C: Using Node.js Script

**Prerequisites:**
- Node.js 22 or higher
- npm package manager

**Step 1: Install Dependencies**
```bash
npm install argon2 crypto
```

**Step 2: Create Decryption Script**

Save the following as `decrypt_passvault.js`:

```javascript
const fs = require('fs');
const crypto = require('crypto');
const argon2 = require('argon2');
const readline = require('readline');

async function decryptPassVaultFile(backupFilePath, password) {
    // Load backup file
    const backup = JSON.parse(fs.readFileSync(backupFilePath, 'utf8'));

    console.log(`Loaded backup for user: ${backup.username}`);
    console.log(`Last modified: ${backup.lastModified}`);

    // Extract parameters
    const salt = Buffer.from(backup.encryptionSalt, 'base64');
    const encryptedData = Buffer.from(backup.encryptedContent, 'base64');
    const params = backup.parameters.argon2;

    // Derive encryption key from password using Argon2id
    console.log('\nDeriving encryption key from password (this may take a few seconds)...');
    const encryptionKey = await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: params.memory,
        timeCost: params.iterations,
        parallelism: params.parallelism,
        hashLength: params.hashLength,
        salt: salt,
        raw: true
    });
    console.log('✓ Key derived successfully');

    // Extract IV, ciphertext, and tag
    // Format: [IV (12 bytes) || Ciphertext || Tag (16 bytes)]
    const iv = encryptedData.slice(0, 12);
    const tag = encryptedData.slice(-16);
    const ciphertext = encryptedData.slice(12, -16);

    // Decrypt using AES-256-GCM
    console.log('Decrypting file content...');
    try {
        const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, iv);
        decipher.setAuthTag(tag);

        let plaintext = decipher.update(ciphertext, null, 'utf8');
        plaintext += decipher.final('utf8');

        console.log('✓ Decryption successful!\n');
        return plaintext;
    } catch (e) {
        console.log(`✗ Decryption failed: ${e.message}`);
        console.log('\nPossible reasons:');
        console.log('  - Incorrect password');
        console.log('  - Corrupted backup file');
        console.log('  - Tampered encrypted content');
        return null;
    }
}

async function main() {
    console.log('='.repeat(60));
    console.log('PassVault File Recovery Tool');
    console.log('='.repeat(60));
    console.log();

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

    const backupFile = await question('Enter path to backup file (passvault-backup.json): ') || 'passvault-backup.json';
    const password = await question('Enter your PassVault login password: ');

    console.log();

    const plaintext = await decryptPassVaultFile(backupFile, password);

    if (plaintext) {
        console.log('-'.repeat(60));
        console.log('DECRYPTED CONTENT:');
        console.log('-'.repeat(60));
        console.log(plaintext);
        console.log('-'.repeat(60));

        const save = await question('\nSave decrypted content to file? (y/n): ');
        if (save.toLowerCase() === 'y') {
            const outputFile = await question('Output filename (decrypted.txt): ') || 'decrypted.txt';
            fs.writeFileSync(outputFile, plaintext);
            console.log(`✓ Saved to ${outputFile}`);
        }
    } else {
        console.log('\nDecryption failed. Please check your password and try again.');
        process.exit(1);
    }

    rl.close();
}

main().catch(console.error);
```

**Step 3: Run the Script**
```bash
node decrypt_passvault.js
```

---

## 4. Troubleshooting

### "Decryption failed" Error

**Possible Causes:**
1. **Incorrect Password**
   - Ensure you're using your current login password (not an old password)
   - Check for typos, extra spaces, or wrong capitalization
   - Passwords are case-sensitive

2. **Corrupted Backup File**
   - Re-download the backup file from PassVault
   - Verify the JSON is valid (open in text editor)

3. **Wrong Backup File**
   - Ensure you're using the correct backup file for your account
   - Check the `username` field in the JSON

4. **Password Was Changed After Backup**
   - If you changed your password after creating the backup, you need the OLD password to decrypt this backup
   - Download a new backup with your current password

### "Module not found" Error (Python)

```bash
# Install missing modules
pip install argon2-cffi cryptography
```

### "Cannot find module" Error (Node.js)

```bash
# Install in the same directory as the script
npm install argon2 crypto
```

### Performance Issues

- Argon2id is intentionally slow (security feature)
- Decryption may take 2-5 seconds on slower machines
- This is normal and expected

---

## 5. Technical Details

### Encryption Algorithms

**Key Derivation: Argon2id**
- Purpose: Convert your password into a 256-bit encryption key
- Parameters:
  - Memory: 64 MB (65536 KB)
  - Iterations: 3
  - Parallelism: 4
  - Output: 256 bits (32 bytes)
- **Post-Quantum Resistant**: Memory-hard function resistant to both classical and quantum attacks

**Symmetric Encryption: AES-256-GCM**
- Purpose: Encrypt/decrypt file content
- Key size: 256 bits
- IV size: 96 bits (12 bytes)
- Tag size: 128 bits (16 bytes)
- Mode: GCM (Galois/Counter Mode) - provides authenticated encryption
- **Post-Quantum Resistant**: 256-bit keys provide 128-bit quantum security (still very secure)

### File Format

**Encrypted Content Structure:**
```
[IV (12 bytes)] [Ciphertext (variable)] [Auth Tag (16 bytes)]
```

All encoded as base64 in the backup JSON file.

### Security Properties

✓ **End-to-End Encryption**: PassVault servers never see your plaintext
✓ **Zero-Knowledge**: Only you can decrypt with your password
✓ **Authenticated Encryption**: GCM mode prevents tampering
✓ **Post-Quantum Safe**: Resistant to quantum computer attacks
✓ **Offline Recovery**: Decrypt without PassVault application

### Why This Doesn't Weaken Security

1. **Password Required**: Encrypted file is useless without your password
2. **No Backdoors**: No master keys, no recovery keys without password
3. **Industry Standard**: Following best practices for end-to-end encryption (like Signal, 1Password)
4. **User Ownership**: You have full control and portability of your data

---

## Support

If you encounter issues with file recovery:

1. Verify you're using the correct password
2. Ensure your backup file is not corrupted (valid JSON)
3. Check that you have the correct dependencies installed
4. Try the alternative decryption methods

**Remember:** Your encrypted backup is only as secure as your password. Keep your password safe and never share it with anyone.

---

## License & Warranty

This recovery tool is provided as-is for your convenience. The encryption implementation follows industry-standard cryptographic practices. Always keep multiple backups of important data.
