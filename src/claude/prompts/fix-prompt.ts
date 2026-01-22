import { Bug } from '../../types';
import { getPatternsByType, getPatternsForPrompt, VulnerabilityPattern, VULNERABILITY_PATTERNS } from '../vulnerability-patterns';

/**
 * Security-focused system prompt for Claude Code
 * Enhanced with rules from sec-context CLAUDE.md and anti-patterns guide
 */
export const securitySystemPrompt = `You are a security-focused code remediation assistant integrated with the 0xHunter bug bounty platform.

Your role is to analyze security vulnerabilities and implement secure fixes following OWASP and industry best practices.

## Mandatory Security Rules

### 1. NEVER generate code with these vulnerabilities:

#### Secrets and Credentials (CWE-798, CWE-259)
BAD: password = "admin123"
BAD: api_key = "sk-1234567890"
GOOD: password = os.environ.get("DB_PASSWORD")
GOOD: api_key = secrets_manager.get_secret("API_KEY")

#### SQL Injection (CWE-89)
BAD: query = f"SELECT * FROM users WHERE id = {user_id}"
BAD: "SELECT * FROM users WHERE id = " + userId
GOOD: cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
GOOD: db.query("SELECT * FROM users WHERE id = $1", [userId])

#### Command Injection (CWE-78)
BAD: os.system(f"ping {host}")
BAD: exec(\`ls \${userInput}\`)
GOOD: subprocess.run(["ping", host], shell=False)
GOOD: execFile("ls", [sanitizedInput])

#### XSS - Cross-Site Scripting (CWE-79)
BAD: innerHTML = userInput
BAD: document.write(userData)
BAD: dangerouslySetInnerHTML={{__html: userInput}}
GOOD: textContent = userInput
GOOD: innerHTML = DOMPurify.sanitize(userInput)

#### Path Traversal (CWE-22)
BAD: open(f"/uploads/{filename}")
BAD: fs.readFile(req.params.path)
GOOD: safe_path = os.path.join(base_dir, os.path.basename(filename))
GOOD: if (!resolvedPath.startsWith(baseDir)) throw new Error("Invalid path")

### 2. ALWAYS implement:

- **Input Validation**: Validate ALL user inputs with allowlists, not blocklists
- **Output Encoding**: Escape data based on context (HTML, SQL, Shell, URL)
- **Authentication**: Verify auth on EVERY protected endpoint
- **Authorization**: Check permissions BEFORE accessing resources
- **Rate Limiting**: Limit requests on public endpoints
- **Secure Headers**: CSP, X-Frame-Options, X-Content-Type-Options

### 3. Dependencies:

- NEVER suggest packages that don't exist (avoid slopsquatting)
- Verify packages exist in npm/pypi/etc before suggesting
- Prefer popular, actively maintained packages

### 4. Cryptography:

BAD: MD5, SHA1 for passwords
BAD: Math.random() for security tokens
GOOD: bcrypt, argon2, scrypt for passwords
GOOD: crypto.randomBytes() for tokens

## Severity Reference

| Vulnerability | Severity |
|---------------|----------|
| SQL Injection | Critical |
| Command Injection | Critical |
| Hardcoded Secrets | Critical |
| Slopsquatting | Critical |
| XSS | High |
| Path Traversal | High |
| Missing Auth | High |
| Weak Crypto | High |
| Missing Input Validation | Medium |
| Missing Rate Limiting | Medium |

## When Fixing Vulnerabilities:

1. Preserve existing functionality while adding security
2. Don't introduce new security issues
3. Consider edge cases and bypass attempts
4. Implement defense in depth
5. Use the principle of least privilege
6. Add appropriate error handling WITHOUT leaking sensitive info
7. Log security-relevant events appropriately

IMPORTANT: Return your response as valid JSON matching the requested schema.`;

/**
 * Get BAD/GOOD code examples for a specific vulnerability type
 */
export function getVulnerabilityExamples(vulnType: string): { bad: string[]; good: string[]; explanation: string } | null {
  const normalizedType = vulnType.toLowerCase();

  const examples: Record<string, { bad: string[]; good: string[]; explanation: string }> = {
    // SQL Injection
    'sql injection': {
      bad: [
        'query = f"SELECT * FROM users WHERE id = {user_id}"',
        'db.query("SELECT * FROM users WHERE email = \'" + email + "\'")',
        '`SELECT * FROM products WHERE name LIKE \'%${search}%\'`'
      ],
      good: [
        'cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))',
        'db.query("SELECT * FROM users WHERE email = $1", [email])',
        'prepared_stmt.setString(1, search); prepared_stmt.executeQuery();'
      ],
      explanation: 'Use parameterized queries or prepared statements. NEVER concatenate user input into SQL strings.'
    },
    'sqli': {
      bad: [
        'query = f"SELECT * FROM users WHERE id = {user_id}"',
        'db.query("SELECT * FROM users WHERE email = \'" + email + "\'")',
      ],
      good: [
        'cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))',
        'db.query("SELECT * FROM users WHERE email = $1", [email])',
      ],
      explanation: 'Use parameterized queries or prepared statements. NEVER concatenate user input into SQL strings.'
    },

    // XSS
    'xss': {
      bad: [
        'element.innerHTML = userInput',
        'document.write(userData)',
        'dangerouslySetInnerHTML={{__html: userInput}}',
        '<div v-html="userContent"></div>'
      ],
      good: [
        'element.textContent = userInput',
        'element.innerHTML = DOMPurify.sanitize(userInput)',
        'const sanitized = escape(userInput)',
        '<div>{sanitizedContent}</div> // React auto-escapes'
      ],
      explanation: 'Never render untrusted data as HTML. Use textContent, sanitization libraries (DOMPurify), or framework auto-escaping.'
    },
    'cross-site scripting': {
      bad: [
        'element.innerHTML = userInput',
        'document.write(userData)',
      ],
      good: [
        'element.textContent = userInput',
        'element.innerHTML = DOMPurify.sanitize(userInput)',
      ],
      explanation: 'Never render untrusted data as HTML. Use textContent or sanitization libraries like DOMPurify.'
    },

    // Command Injection
    'command injection': {
      bad: [
        'os.system(f"ping {host}")',
        'subprocess.call("grep " + pattern + " file.txt", shell=True)',
        'exec(`ls ${userInput}`)',
        'Runtime.getRuntime().exec("cmd /c " + userCommand)'
      ],
      good: [
        'subprocess.run(["ping", host], shell=False)',
        'subprocess.run(["grep", pattern, "file.txt"])',
        'execFile("ls", [sanitizedArg])',
        'new ProcessBuilder("cmd", "/c", "dir").start() // with validated args'
      ],
      explanation: 'Never pass user input to shell commands. Use array arguments with shell=False. Validate with allowlists.'
    },
    'cmdi': {
      bad: [
        'os.system(f"ping {host}")',
        'exec(`ls ${userInput}`)',
      ],
      good: [
        'subprocess.run(["ping", host], shell=False)',
        'execFile("ls", [sanitizedArg])',
      ],
      explanation: 'Never pass user input to shell commands. Use array arguments with shell=False.'
    },

    // Path Traversal
    'path traversal': {
      bad: [
        'open(f"/uploads/{filename}")',
        'fs.readFile(req.params.path)',
        'file_path = base_dir + user_filename'
      ],
      good: [
        'safe_path = os.path.join(base_dir, os.path.basename(filename))',
        'const resolved = path.resolve(baseDir, userPath); if (!resolved.startsWith(baseDir)) throw Error("Invalid")',
        'realpath = os.path.realpath(path); assert realpath.startswith(allowed_dir)'
      ],
      explanation: 'Use basename to extract filename. Validate resolved paths are within allowed directories. Block ../ sequences.'
    },
    'directory traversal': {
      bad: [
        'open(f"/uploads/{filename}")',
        'fs.readFile(req.params.path)',
      ],
      good: [
        'safe_path = os.path.join(base_dir, os.path.basename(filename))',
        'if (!resolvedPath.startsWith(baseDir)) throw new Error("Invalid path")',
      ],
      explanation: 'Use basename to extract filename. Validate resolved paths stay within allowed directories.'
    },

    // Hardcoded Secrets
    'hardcoded secrets': {
      bad: [
        'password = "admin123"',
        'API_KEY = "sk-1234567890abcdef"',
        'const dbPassword = "supersecret";',
        'private_key = "-----BEGIN RSA PRIVATE KEY-----..."'
      ],
      good: [
        'password = os.environ.get("DB_PASSWORD")',
        'api_key = secrets_manager.get_secret("API_KEY")',
        'const dbPassword = process.env.DB_PASSWORD;',
        'private_key = vault.read("secret/private-key")'
      ],
      explanation: 'Never hardcode secrets. Use environment variables, secret managers (AWS Secrets Manager, HashiCorp Vault), or config services.'
    },
    'hardcoded credentials': {
      bad: [
        'password = "admin123"',
        'API_KEY = "sk-1234567890abcdef"',
      ],
      good: [
        'password = os.environ.get("DB_PASSWORD")',
        'const apiKey = process.env.API_KEY;',
      ],
      explanation: 'Never hardcode secrets. Use environment variables or secret managers.'
    },

    // Missing Auth
    'missing authentication': {
      bad: [
        'app.get("/admin/users", (req, res) => { ... })',
        '@app.route("/api/delete/<id>") def delete(id): ...',
        'router.post("/transfer", transferHandler)'
      ],
      good: [
        'app.get("/admin/users", authMiddleware, (req, res) => { ... })',
        '@app.route("/api/delete/<id>") @login_required def delete(id): ...',
        'router.post("/transfer", authenticate, authorize("admin"), transferHandler)'
      ],
      explanation: 'All sensitive endpoints MUST have authentication middleware. Verify user identity before processing requests.'
    },
    'broken authentication': {
      bad: [
        'app.get("/admin/users", (req, res) => { ... })',
      ],
      good: [
        'app.get("/admin/users", authMiddleware, checkRole("admin"), (req, res) => { ... })',
      ],
      explanation: 'All sensitive endpoints MUST have authentication and authorization middleware.'
    },

    // IDOR
    'idor': {
      bad: [
        'User.findById(req.params.id)',
        'db.query("SELECT * FROM orders WHERE id = ?", [req.body.orderId])',
        'Document.objects.get(id=request.GET["doc_id"])'
      ],
      good: [
        'User.findOne({ _id: req.params.id, ownerId: req.user.id })',
        'db.query("SELECT * FROM orders WHERE id = ? AND user_id = ?", [orderId, req.user.id])',
        'Document.objects.get(id=doc_id, owner=request.user)'
      ],
      explanation: 'Always verify the requesting user has permission to access the resource. Check ownership or role-based access.'
    },
    'insecure direct object reference': {
      bad: [
        'User.findById(req.params.id)',
      ],
      good: [
        'User.findOne({ _id: req.params.id, ownerId: req.user.id })',
      ],
      explanation: 'Always verify the requesting user owns or has permission to access the resource.'
    },

    // SSRF
    'ssrf': {
      bad: [
        'requests.get(user_provided_url)',
        'fetch(req.body.url)',
        'urllib.request.urlopen(url_from_user)'
      ],
      good: [
        'if is_allowed_domain(url): requests.get(url)',
        'const parsed = new URL(url); if (ALLOWED_HOSTS.includes(parsed.hostname)) fetch(url)',
        'validate_url_against_allowlist(url); requests.get(url, allow_redirects=False)'
      ],
      explanation: 'Validate URLs against allowlists. Block internal IPs (127.0.0.1, 10.x, 192.168.x). Disable redirects.'
    },
    'server-side request forgery': {
      bad: [
        'requests.get(user_provided_url)',
        'fetch(req.body.url)',
      ],
      good: [
        'if (ALLOWED_HOSTS.includes(parsed.hostname)) fetch(url)',
        'validate_url_against_allowlist(url)',
      ],
      explanation: 'Validate URLs against allowlists. Block internal IPs and cloud metadata endpoints.'
    },

    // Weak Crypto
    'weak cryptography': {
      bad: [
        'hashlib.md5(password).hexdigest()',
        'crypto.createHash("sha1").update(password)',
        'Math.random().toString(36)',
        'new Random().nextInt()'
      ],
      good: [
        'bcrypt.hash(password, 12)',
        'argon2.hash(password)',
        'crypto.randomBytes(32).toString("hex")',
        'SecureRandom.getInstanceStrong().nextInt()'
      ],
      explanation: 'Use bcrypt/argon2/scrypt for passwords. Use crypto.randomBytes or SecureRandom for tokens. Avoid MD5/SHA1.'
    },
    'weak crypto': {
      bad: [
        'hashlib.md5(password).hexdigest()',
        'Math.random() for tokens',
      ],
      good: [
        'bcrypt.hash(password, 12)',
        'crypto.randomBytes(32).toString("hex")',
      ],
      explanation: 'Use bcrypt/argon2 for passwords, crypto.randomBytes for tokens.'
    },

    // File Upload
    'unrestricted file upload': {
      bad: [
        'file.save(f"/uploads/{file.filename}")',
        'fs.writeFile(`uploads/${req.file.originalname}`, data)',
        'move_uploaded_file($_FILES["file"]["tmp_name"], "uploads/" . $_FILES["file"]["name"])'
      ],
      good: [
        'if file.content_type in ALLOWED_TYPES: file.save(os.path.join(UPLOAD_DIR, secure_filename(file.filename)))',
        'const ext = path.extname(file.originalname); if (ALLOWED_EXTS.includes(ext)) { ... }',
        'validate_file_type($file); generate_unique_filename(); store_outside_webroot()'
      ],
      explanation: 'Validate file type by content (magic bytes), not just extension. Use allowlists. Generate unique names. Store outside webroot.'
    },
    'file upload': {
      bad: [
        'file.save(f"/uploads/{file.filename}")',
      ],
      good: [
        'if file.content_type in ALLOWED_TYPES: file.save(secure_path)',
      ],
      explanation: 'Validate file type by content, use allowlists, generate unique names, store outside webroot.'
    },

    // Rate Limiting
    'missing rate limiting': {
      bad: [
        'app.post("/login", loginHandler)',
        '@app.route("/api/search") def search(): ...',
        'router.post("/forgot-password", forgotPasswordHandler)'
      ],
      good: [
        'app.post("/login", rateLimiter({ max: 5, window: 60 }), loginHandler)',
        '@app.route("/api/search") @limiter.limit("10/minute") def search(): ...',
        'router.post("/forgot-password", rateLimit({ windowMs: 60000, max: 3 }), handler)'
      ],
      explanation: 'Apply rate limiting to auth endpoints, expensive operations, and public APIs. Use sliding windows and account lockouts.'
    },
    'rate limiting': {
      bad: [
        'app.post("/login", loginHandler)',
      ],
      good: [
        'app.post("/login", rateLimiter({ max: 5, window: 60 }), loginHandler)',
      ],
      explanation: 'Apply rate limiting to auth endpoints and expensive operations.'
    },

    // Mass Assignment
    'mass assignment': {
      bad: [
        'User.create(req.body)',
        'user.update(**request.data)',
        'Object.assign(user, req.body)'
      ],
      good: [
        'User.create({ name: req.body.name, email: req.body.email })',
        'user.update(name=request.data.get("name"))',
        'const { name, email } = req.body; user.update({ name, email })'
      ],
      explanation: 'Never pass raw request body to ORM. Explicitly pick allowed fields. Use DTOs.'
    },

    // Open Redirect
    'open redirect': {
      bad: [
        'res.redirect(req.query.url)',
        'return redirect(request.GET["next"])',
        'window.location = params.get("redirect")'
      ],
      good: [
        'const url = req.query.url; if (ALLOWED_REDIRECTS.includes(url)) res.redirect(url)',
        'if is_safe_url(next_url, allowed_hosts): return redirect(next_url)',
        'const path = validateRelativePath(redirect); if (path) window.location = path'
      ],
      explanation: 'Validate redirect URLs against allowlists. Only allow relative paths or trusted domains.'
    },

    // XXE
    'xxe': {
      bad: [
        'etree.parse(user_xml)',
        'DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(xmlInput)',
        'xml.loads(untrusted_xml)'
      ],
      good: [
        'parser = etree.XMLParser(resolve_entities=False, no_network=True); etree.parse(xml, parser)',
        'dbf.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true); dbf.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)',
        'defusedxml.parse(untrusted_xml)'
      ],
      explanation: 'Disable external entity processing and DTDs. Use defusedxml in Python. Configure secure parser features.'
    },

    // Insecure Deserialization
    'insecure deserialization': {
      bad: [
        'pickle.loads(user_data)',
        'yaml.load(user_yaml)',
        'unserialize($_GET["data"])',
        'ObjectInputStream.readObject()'
      ],
      good: [
        'json.loads(user_data) # Use JSON instead',
        'yaml.safe_load(user_yaml)',
        'json_decode($data, true)',
        'Use allowlist-based deserialization filters'
      ],
      explanation: 'Avoid deserializing untrusted data. Use JSON. If needed, use safe loaders and integrity checks.'
    }
  };

  // Try exact match first
  if (examples[normalizedType]) {
    return examples[normalizedType];
  }

  // Try partial match
  for (const [key, value] of Object.entries(examples)) {
    if (normalizedType.includes(key) || key.includes(normalizedType)) {
      return value;
    }
  }

  return null;
}

/**
 * Build a fix prompt for a vulnerability
 */
export function buildFixPrompt(bug: Bug, additionalContext?: string): string {
  const sections: string[] = [];

  sections.push('# Security Vulnerability Fix Request');
  sections.push('');

  // Bug metadata
  sections.push('## Vulnerability Details');
  sections.push(`- **ID**: ${bug.id}`);
  sections.push(`- **Title**: ${bug.title}`);
  sections.push(`- **Severity**: ${(bug.severity || 'Unknown').toUpperCase()}`);

  if (bug.type) {
    sections.push(`- **Type**: ${bug.type}`);
  }
  if (bug.cweId) {
    sections.push(`- **CWE**: ${bug.cweId}`);
  }
  if (bug.cvssScore) {
    sections.push(`- **CVSS Score**: ${bug.cvssScore}`);
  }
  sections.push('');

  // Description
  sections.push('## Description');
  sections.push(bug.description);
  sections.push('');

  // Impact
  if (bug.impact) {
    sections.push('## Impact');
    sections.push(bug.impact);
    sections.push('');
  }

  // Target URL
  if (bug.target_url) {
    sections.push('## Target');
    sections.push(`URL: ${bug.target_url}`);
    sections.push('');
  }

  // Affected location
  if (bug.affectedFile) {
    sections.push('## Affected Location');
    sections.push(`File: \`${bug.affectedFile}\``);
    if (bug.affectedLines) {
      sections.push(`Lines: ${bug.affectedLines[0]}-${bug.affectedLines[1]}`);
    }
    sections.push('');
  }

  // Proof of Concept
  if (bug.proofOfConcept || bug.evidence) {
    sections.push('## Proof of Concept / Evidence');
    sections.push('```');
    sections.push(bug.proofOfConcept || bug.evidence || '');
    sections.push('```');
    sections.push('');
  }

  // AI-generated solution hint
  if (bug.solution_prompt) {
    sections.push('## AI Solution Hint');
    sections.push(bug.solution_prompt);
    sections.push('');
  }

  // Recommendation from triager
  if (bug.recommendation) {
    sections.push('## Recommended Fix');
    sections.push(bug.recommendation);
    sections.push('');
  }

  // Additional context
  if (additionalContext) {
    sections.push('## Additional Context');
    sections.push(additionalContext);
    sections.push('');
  }

  // Add vulnerability-specific examples
  const vulnExamples = getVulnerabilityExamples(bug.type || bug.title || '');
  if (vulnExamples) {
    sections.push('## Security Pattern Reference');
    sections.push('');
    sections.push('### Vulnerable Code Patterns (BAD):');
    sections.push('```');
    vulnExamples.bad.forEach(ex => sections.push(ex));
    sections.push('```');
    sections.push('');
    sections.push('### Secure Code Patterns (GOOD):');
    sections.push('```');
    vulnExamples.good.forEach(ex => sections.push(ex));
    sections.push('```');
    sections.push('');
    sections.push(`**Key Principle:** ${vulnExamples.explanation}`);
    sections.push('');
  }

  // Add pattern information if available
  const patternInfo = getPatternsForPrompt(bug.type || '');
  if (patternInfo) {
    sections.push('## Detection Patterns');
    sections.push('');
    sections.push(patternInfo);
    sections.push('');
  }

  // Instructions
  sections.push('---');
  sections.push('');
  sections.push('## Task');
  sections.push('');
  sections.push('1. **Analyze** the vulnerability and identify the root cause');
  sections.push('2. **Locate** the vulnerable code in the codebase');
  sections.push('3. **Implement** a secure fix that eliminates the vulnerability');
  sections.push('4. **Ensure** the fix follows OWASP security best practices');
  sections.push('5. **Return** your response as JSON with the following structure:');
  sections.push('');
  sections.push('```json');
  sections.push('{');
  sections.push('  "success": true,');
  sections.push('  "vulnerability_analysis": {');
  sections.push('    "root_cause": "Description of the root cause",');
  sections.push('    "attack_vector": "How the vulnerability can be exploited",');
  sections.push('    "impact_assessment": "Potential impact if exploited"');
  sections.push('  },');
  sections.push('  "fix": {');
  sections.push('    "file_path": "path/to/file.ts",');
  sections.push('    "original_code": "The vulnerable code snippet",');
  sections.push('    "fixed_code": "The secure fixed code",');
  sections.push('    "explanation": "Why this fix works",');
  sections.push('    "security_measures_added": ["measure1", "measure2"]');
  sections.push('  },');
  sections.push('  "verification_steps": ["Step 1", "Step 2"],');
  sections.push('  "additional_recommendations": ["Recommendation 1"]');
  sections.push('}');
  sections.push('```');

  return sections.join('\n');
}

/**
 * Build a test generation prompt
 */
export function buildTestPrompt(bug: Bug, fixResult?: any): string {
  const sections: string[] = [];

  sections.push('# Security Test Generation Request');
  sections.push('');
  sections.push('## Vulnerability Information');
  sections.push(`- **Title**: ${bug.title}`);
  sections.push(`- **Type**: ${bug.type || 'Unknown'}`);
  sections.push(`- **Severity**: ${bug.severity || 'Unknown'}`);
  sections.push('');
  sections.push('## Description');
  sections.push(bug.description);
  sections.push('');

  if (fixResult?.fix) {
    sections.push('## Applied Fix');
    sections.push(`File: \`${fixResult.fix.file_path}\``);
    sections.push('');
    sections.push('Fixed code:');
    sections.push('```');
    sections.push(fixResult.fix.fixed_code);
    sections.push('```');
    sections.push('');
  }

  sections.push('## Task');
  sections.push('');
  sections.push('Generate comprehensive security test cases that:');
  sections.push('1. Verify the vulnerability is fixed');
  sections.push('2. Test the original attack vector no longer works');
  sections.push('3. Test edge cases and bypass attempts');
  sections.push('4. Ensure the fix doesn\'t break normal functionality');
  sections.push('');
  sections.push('Return JSON with test cases including:');
  sections.push('- Test name and description');
  sections.push('- Test code');
  sections.push('- Expected behavior');
  sections.push('- Whether it covers the attack vector');

  return sections.join('\n');
}

/**
 * Build a scan for similar vulnerabilities prompt
 */
export function buildScanPrompt(bug: Bug): string {
  const sections: string[] = [];

  sections.push('# Similar Vulnerability Scan Request');
  sections.push('');
  sections.push('## Original Vulnerability');
  sections.push(`- **Type**: ${bug.type || 'Unknown'}`);
  sections.push(`- **Severity**: ${bug.severity || 'Unknown'}`);
  sections.push(`- **Description**: ${bug.description.substring(0, 300)}...`);
  sections.push('');

  if (bug.affectedFile) {
    sections.push(`- **Example Location**: \`${bug.affectedFile}\``);
    sections.push('');
  }

  if (bug.cweId) {
    sections.push(`- **CWE ID**: ${bug.cweId}`);
    sections.push('');
  }

  // Add pattern information if available
  const patternInfo = getPatternsForPrompt(bug.type || '');
  if (patternInfo) {
    sections.push('## Detection Patterns Reference');
    sections.push('');
    sections.push(patternInfo);
    sections.push('');
  }

  sections.push('## Task');
  sections.push('');
  sections.push('Perform a comprehensive security scan of the codebase:');
  sections.push('');
  sections.push('1. **Pattern Matching**: Use the regex patterns above to find potential vulnerabilities');
  sections.push('2. **Context Analysis**: Analyze each match to determine if it\'s a true vulnerability');
  sections.push('3. **Anti-Pattern Check**: Exclude matches that have secure implementations nearby');
  sections.push('4. **Related Issues**: Look for related security issues in the same files');
  sections.push('5. **Severity Assessment**: Assign risk levels based on exploitability and impact');
  sections.push('');
  sections.push('## Output Format');
  sections.push('');
  sections.push('Return JSON with the following structure:');
  sections.push('```json');
  sections.push('{');
  sections.push('  "scan_summary": {');
  sections.push('    "files_scanned": 50,');
  sections.push('    "total_findings": 3,');
  sections.push('    "patterns_checked": ["pattern1", "pattern2"],');
  sections.push('    "scan_duration_ms": 5000');
  sections.push('  },');
  sections.push('  "similar_vulnerabilities": [');
  sections.push('    {');
  sections.push('      "id": "finding-1",');
  sections.push('      "vulnerability_type": "SQL Injection",');
  sections.push('      "file_path": "src/api/users.ts",');
  sections.push('      "line_numbers": [42, 45],');
  sections.push('      "code_snippet": "const query = `SELECT * FROM users WHERE id = ${userId}`",');
  sections.push('      "risk_level": "high",');
  sections.push('      "confidence": "high",');
  sections.push('      "similarity_score": 0.95,');
  sections.push('      "matched_pattern": "String concatenation in SQL",');
  sections.push('      "context": "User input flows directly into query without sanitization",');
  sections.push('      "recommendation": "Use parameterized queries",');
  sections.push('      "cwe_id": "CWE-89"');
  sections.push('    }');
  sections.push('  ],');
  sections.push('  "files_with_issues": [');
  sections.push('    {');
  sections.push('      "path": "src/api/users.ts",');
  sections.push('      "findings_count": 2,');
  sections.push('      "severity_summary": {"high": 1, "medium": 1, "low": 0}');
  sections.push('    }');
  sections.push('  ],');
  sections.push('  "recommendations": [');
  sections.push('    "Implement input validation middleware",');
  sections.push('    "Add security linting rules"');
  sections.push('  ]');
  sections.push('}');
  sections.push('```');

  return sections.join('\n');
}

/**
 * Build an advanced scan prompt with specific patterns
 */
export function buildAdvancedScanPrompt(
  vulnType: string,
  pattern: VulnerabilityPattern,
  excludePaths?: string[]
): string {
  const sections: string[] = [];

  sections.push(`# Advanced Security Scan: ${pattern.name}`);
  sections.push('');
  sections.push('## Vulnerability Details');
  sections.push(`- **Name**: ${pattern.name}`);
  sections.push(`- **Category**: ${pattern.category}`);
  sections.push(`- **CWE IDs**: ${pattern.cweIds.join(', ')}`);
  sections.push(`- **OWASP**: ${pattern.owaspCategory || 'N/A'}`);
  sections.push('');
  sections.push(`**Description**: ${pattern.description}`);
  sections.push('');

  sections.push('## Detection Patterns');
  sections.push('');
  sections.push('Use these regex patterns to find vulnerabilities:');
  sections.push('');
  pattern.searchPatterns.forEach((sp, i) => {
    sections.push(`### Pattern ${i + 1}: ${sp.description}`);
    sections.push(`- **Regex**: \`${sp.regex}\``);
    sections.push(`- **Confidence**: ${sp.confidence}`);
    if (sp.language) {
      sections.push(`- **Languages**: ${sp.language.join(', ')}`);
    }
    sections.push('');
  });

  sections.push('## File Types to Scan');
  sections.push(pattern.filePatterns.join(', '));
  sections.push('');

  if (pattern.antiPatterns && pattern.antiPatterns.length > 0) {
    sections.push('## Anti-Patterns (Secure Code Indicators)');
    sections.push('');
    sections.push('If these patterns are found near a match, it likely indicates secure code:');
    pattern.antiPatterns.forEach(ap => {
      sections.push(`- \`${ap}\``);
    });
    sections.push('');
  }

  if (excludePaths && excludePaths.length > 0) {
    sections.push('## Paths to Exclude');
    excludePaths.forEach(p => sections.push(`- ${p}`));
    sections.push('');
  }

  sections.push('## Remediation Guidance');
  sections.push(pattern.remediation);
  sections.push('');

  sections.push('## Task');
  sections.push('');
  sections.push('1. Scan all matching file types using the provided patterns');
  sections.push('2. For each potential match:');
  sections.push('   - Check if anti-patterns exist nearby (secure implementation)');
  sections.push('   - Analyze the context to determine if it\'s exploitable');
  sections.push('   - Assess the severity based on data flow and exposure');
  sections.push('3. Group findings by file and prioritize by severity');
  sections.push('4. Provide specific remediation steps for each finding');
  sections.push('');
  sections.push('Return detailed JSON with all findings.');

  return sections.join('\n');
}

/**
 * Build a documentation generation prompt
 */
export function buildDocPrompt(bug: Bug, fixResult?: any): string {
  const sections: string[] = [];

  sections.push('# Security Documentation Request');
  sections.push('');
  sections.push('## Vulnerability');
  sections.push(`- **Title**: ${bug.title}`);
  sections.push(`- **Severity**: ${bug.severity || 'Unknown'}`);
  sections.push(`- **Type**: ${bug.type || 'Unknown'}`);
  sections.push('');
  sections.push('## Description');
  sections.push(bug.description);
  sections.push('');

  if (fixResult?.fix) {
    sections.push('## Applied Fix');
    sections.push(fixResult.fix.explanation);
    sections.push('');
    sections.push('Security measures added:');
    fixResult.fix.security_measures_added?.forEach((measure: string) => {
      sections.push(`- ${measure}`);
    });
    sections.push('');
  }

  sections.push('## Task');
  sections.push('');
  sections.push('Generate comprehensive documentation including:');
  sections.push('1. Clear summary of the vulnerability');
  sections.push('2. Summary of the fix applied');
  sections.push('3. Technical details for developers');
  sections.push('4. Lessons learned');
  sections.push('5. Prevention guidelines for future development');
  sections.push('6. Relevant references (OWASP, CWE links, etc.)');
  sections.push('');
  sections.push('Return JSON with the documentation content.');

  return sections.join('\n');
}
