/**
 * JSON Schema for fix results from Claude Code
 */
export const fixResultSchema = {
  type: "object",
  properties: {
    success: {
      type: "boolean",
      description: "Whether the fix was successfully generated"
    },
    vulnerability_analysis: {
      type: "object",
      properties: {
        root_cause: {
          type: "string",
          description: "The root cause of the vulnerability"
        },
        attack_vector: {
          type: "string",
          description: "How the vulnerability could be exploited"
        },
        impact_assessment: {
          type: "string",
          description: "Potential impact if exploited"
        }
      },
      required: ["root_cause", "attack_vector"]
    },
    fix: {
      type: "object",
      properties: {
        file_path: {
          type: "string",
          description: "Path to the file being fixed"
        },
        original_code: {
          type: "string",
          description: "The original vulnerable code"
        },
        fixed_code: {
          type: "string",
          description: "The secure fixed code"
        },
        explanation: {
          type: "string",
          description: "Explanation of the fix and why it works"
        },
        security_measures_added: {
          type: "array",
          items: { type: "string" },
          description: "List of security measures implemented"
        }
      },
      required: ["file_path", "fixed_code", "explanation"]
    },
    verification_steps: {
      type: "array",
      items: { type: "string" },
      description: "Steps to verify the fix works"
    },
    additional_recommendations: {
      type: "array",
      items: { type: "string" },
      description: "Additional security recommendations"
    }
  },
  required: ["success", "vulnerability_analysis", "fix"]
};

/**
 * JSON Schema for test generation results
 */
export const testResultSchema = {
  type: "object",
  properties: {
    test_file_path: {
      type: "string",
      description: "Path where the test file should be created"
    },
    test_framework: {
      type: "string",
      description: "Testing framework used (jest, mocha, pytest, etc.)"
    },
    test_cases: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Name of the test case"
          },
          description: {
            type: "string",
            description: "What the test verifies"
          },
          test_code: {
            type: "string",
            description: "The test code"
          },
          expected_behavior: {
            type: "string",
            description: "Expected behavior when test passes"
          },
          covers_attack_vector: {
            type: "boolean",
            description: "Whether this test covers the original attack vector"
          }
        },
        required: ["name", "test_code"]
      }
    },
    setup_code: {
      type: "string",
      description: "Setup/beforeEach code if needed"
    },
    teardown_code: {
      type: "string",
      description: "Teardown/afterEach code if needed"
    }
  },
  required: ["test_file_path", "test_cases"]
};

/**
 * JSON Schema for scan similar results
 */
export const scanResultSchema = {
  type: "object",
  properties: {
    similar_vulnerabilities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "File containing the similar vulnerability"
          },
          line_numbers: {
            type: "array",
            items: { type: "number" },
            description: "Line numbers where the vulnerability exists"
          },
          similarity_score: {
            type: "number",
            description: "How similar this is to the original (0-1)"
          },
          vulnerability_type: {
            type: "string",
            description: "Type of vulnerability"
          },
          code_snippet: {
            type: "string",
            description: "The vulnerable code snippet"
          },
          risk_level: {
            type: "string",
            enum: ["critical", "high", "medium", "low"],
            description: "Risk level of this finding"
          },
          recommendation: {
            type: "string",
            description: "How to fix this instance"
          }
        },
        required: ["file_path", "vulnerability_type", "risk_level"]
      }
    },
    scan_summary: {
      type: "object",
      properties: {
        files_scanned: {
          type: "number",
          description: "Number of files scanned"
        },
        patterns_checked: {
          type: "array",
          items: { type: "string" },
          description: "Vulnerability patterns checked"
        },
        total_findings: {
          type: "number",
          description: "Total number of findings"
        }
      }
    }
  },
  required: ["similar_vulnerabilities", "scan_summary"]
};

/**
 * JSON Schema for documentation results
 */
export const docResultSchema = {
  type: "object",
  properties: {
    title: {
      type: "string",
      description: "Documentation title"
    },
    vulnerability_summary: {
      type: "string",
      description: "Summary of the vulnerability"
    },
    fix_summary: {
      type: "string",
      description: "Summary of the fix applied"
    },
    technical_details: {
      type: "string",
      description: "Technical details of the vulnerability and fix"
    },
    lessons_learned: {
      type: "array",
      items: { type: "string" },
      description: "Lessons learned from this vulnerability"
    },
    prevention_guidelines: {
      type: "array",
      items: { type: "string" },
      description: "Guidelines to prevent similar issues"
    },
    references: {
      type: "array",
      items: { type: "string" },
      description: "Reference links (OWASP, CWE, etc.)"
    }
  },
  required: ["title", "vulnerability_summary", "fix_summary"]
};
