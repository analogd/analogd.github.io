import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";

export default [
    js.configs.recommended,
    {
        plugins: {
            import: importPlugin
        },
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                // Browser globals
                window: "readonly",
                document: "readonly",
                console: "readonly",
                requestAnimationFrame: "readonly",
                localStorage: "readonly",
                fetch: "readonly",
                HTMLElement: "readonly",
                HTMLCanvasElement: "readonly",
                FileReader: "readonly",
                Blob: "readonly",
                URL: "readonly",
                Event: "readonly",
                alert: "readonly",
                confirm: "readonly",
                URLSearchParams: "readonly",
                crypto: "readonly",
                // Chart.js (loaded via script tag)
                Chart: "readonly",
                // Node globals (for tests)
                process: "readonly"
            }
        },
        rules: {
            // Import validation - the main reason we added ESLint
            "import/no-unresolved": "error",
            "import/named": "error",
            "import/default": "error",
            "import/namespace": "error",
            "import/export": "error",
            // Standard JS
            "no-undef": "error",
            "no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
            // Allow let/const in case blocks (pre-existing code style)
            "no-case-declarations": "off",
            // Allow empty catch blocks (intentional in some error handling)
            "no-empty": "off"
        },
        settings: {
            "import/resolver": {
                node: {
                    extensions: [".js", ".mjs"]
                }
            }
        }
    },
    {
        ignores: ["papers/", "node_modules/"]
    }
];
