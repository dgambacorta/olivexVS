import { Bug } from '../../types';
import { getPatternsByType, getPatternsForPrompt, VulnerabilityPattern } from '../vulnerability-patterns';

/**
 * Security-focused system prompt for Claude Code
 */
export const securitySystemPrompt = `You are a security-focused code remediation assistant integrated with the 0xHunter bug bounty platform.

Your role is to analyze security vulnerabilities and implement secure fixes following industry best practices.

Core principles:
1. NEVER trust user input - always validate and sanitize
2. Use parameterized queries for all database operations
3. Implement proper input validation at all entry points
4. Encode output based on context (HTML, JavaScript, SQL, URL, etc.)
5. Follow the principle of least privilege
6. Implement defense in depth where appropriate
7. Use secure cryptographic practices
8. Log security-relevant events appropriately

When fixing vulnerabilities:
- Preserve existing functionality while adding security
- Don't introduce new security issues
- Consider edge cases and bypass attempts
- Implement comprehensive input validation
- Add appropriate error handling without leaking sensitive info

IMPORTANT: Return your response as valid JSON matching the requested schema.`;

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
