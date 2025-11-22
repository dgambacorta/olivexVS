# Security Vulnerability Fix Request

**Bug ID:** example-bug-123
**Severity:** CRITICAL 🔴
**Status:** new
**CVSS Score:** 9.8
**CWE:** CWE-89

## SQL Injection in User Authentication

### Description
The login endpoint is vulnerable to SQL injection attacks. User-supplied input from the username parameter is directly concatenated into a SQL query without proper sanitization or parameterization. This allows an attacker to bypass authentication, extract sensitive data, or execute arbitrary SQL commands on the database.

### Affected Location
**File:** `src/api/auth/login.py`
**Lines:** 45-52

### Proof of Concept
```python
# Vulnerable code
username = request.form.get('username')
password = request.form.get('password')

query = f"SELECT * FROM users WHERE username = '{username}' AND password = '{password}'"
result = db.execute(query)

# Exploit payload
username = "admin' OR '1'='1' --"
password = "anything"

# This bypasses authentication and logs in as admin
```

### Recommended Fix
1. Use parameterized queries (prepared statements) instead of string concatenation
2. Implement proper input validation and sanitization
3. Use ORM methods that handle escaping automatically
4. Apply the principle of least privilege for database access
5. Add rate limiting to prevent brute force attempts

Example secure implementation:
```python
# Secure code
username = request.form.get('username')
password = request.form.get('password')

# Use parameterized query
query = "SELECT * FROM users WHERE username = ? AND password = ?"
result = db.execute(query, (username, hash_password(password)))
```

### Tags
`sql-injection`, `authentication`, `critical`, `owasp-top-10`

---

## Instructions for Claude Code

Please analyze this security vulnerability and:

1. **Locate the vulnerable code** in the codebase
2. **Analyze the security issue** and understand the attack vector
3. **Implement a secure fix** that:
   - Eliminates the vulnerability completely
   - Follows security best practices
   - Maintains existing functionality
   - Does not introduce new issues
4. **Add security tests** to verify the fix and prevent regression
5. **Document the changes** with clear comments explaining the security improvement

### Security Checklist
- [ ] Vulnerability is completely mitigated
- [ ] No new security issues introduced
- [ ] Input validation is properly implemented
- [ ] Output encoding/escaping is correct
- [ ] Authentication/authorization checks are in place (if applicable)
- [ ] Security tests are added
- [ ] Code follows secure coding standards

**Primary file to fix:** `src/api/auth/login.py`
