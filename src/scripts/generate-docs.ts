import { parseArgs } from 'node:util';
import * as fs from 'fs';
import * as path from 'path';

// 1. The URL Dictionary
const FRAMEWORK_SOURCES = {
    'nextjs': ['https://nextjs.org/docs/llms-full.txt'],
    'react': ['https://react.dev/llms-full.txt'],
    'tailwind': ['https://raw.githubusercontent.com/tailwindlabs/tailwindcss.com/master/src/pages/docs/installation.mdx'],
    'node': ['https://raw.githubusercontent.com/nodejs/node/main/doc/api/fs.md'],
    
    'django': [
        'https://raw.githubusercontent.com/django/django/main/docs/intro/tutorial01.txt',
        'https://raw.githubusercontent.com/django/django/main/docs/intro/tutorial02.txt',
        'https://raw.githubusercontent.com/django/django/main/docs/intro/tutorial03.txt',
        'https://raw.githubusercontent.com/django/django/main/docs/intro/tutorial04.txt',
        'https://raw.githubusercontent.com/django/django/main/docs/intro/tutorial05.txt',
        'https://raw.githubusercontent.com/django/django/main/docs/intro/tutorial06.txt',
        'https://raw.githubusercontent.com/django/django/main/docs/intro/tutorial07.txt',
        'https://raw.githubusercontent.com/django/django/main/docs/intro/tutorial08.txt'

    ]
};

async function main() {
    const { values } = parseArgs({
        options: { framework: { type: 'string' } }
    });

    const targetFramework = values.framework as keyof typeof FRAMEWORK_SOURCES;

    if (!targetFramework || !FRAMEWORK_SOURCES[targetFramework]) {
        console.error(`❌ Invalid framework: ${targetFramework}`);
        process.exit(1);
    }

    console.log(`🤖 Compiling full context for: ${targetFramework}`);
    const urls = FRAMEWORK_SOURCES[targetFramework];
    let masterContent = "";

    try {
        for (const url of urls) {
            console.log(`📡 Fetching: ${url}`);
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to fetch ${url}`);
            
            const text = await response.text();
            // We add a separator so the LLM/Vector DB knows where one part ends and another begins
            masterContent += `\n\n--- SOURCE: ${url} ---\n\n` + text;
        }

        const outputDir = path.join(process.cwd(), 'data', 'llms');
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        const outputPath = path.join(outputDir, `${targetFramework}.txt`);
        fs.writeFileSync(outputPath, masterContent);
        
        console.log(`✅ Compiled ${urls.length} files into ${outputPath}`);

    } catch (error) {
        console.error(`🚨 Error:`, error);
        process.exit(1);
    }
}

main();