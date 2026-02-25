//@ts-nocheck

import { parseArgs } from 'node:util';
import * as fs from 'fs';
import * as path from 'path';

// 1. The URL Dictionary (Static Sources)
const FRAMEWORK_SOURCES = {
    'nextjs': ['https://nextjs.org/docs/llms-full.txt'],
    'react': ['https://react.dev/llms.txt'],
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

// 2. Dynamic Fetcher for Tailwind (GitHub API)
async function fetchTailwindDocs() {
    console.log(`📡 Fetching Tailwind file list from GitHub API...`);
    // Hits the directory shown in your screenshot
    const apiUrl = 'https://api.github.com/repos/tailwindlabs/tailwindcss.com/contents/src/docs';
    
    // Note: If you hit rate limits, you may need to pass a GITHUB_TOKEN in the headers here
    const response = await fetch(apiUrl);

    if (!response.ok) throw new Error(`Failed to fetch Tailwind docs list: ${response.statusText}`);

    const files = await response.json();
    
    // Filter for only .mdx documentation files
    const mdxFiles = files.filter(f => f.name.endsWith('.mdx'));

    console.log(`Found ${mdxFiles.length} MDX files. Downloading...`);

    let content = '';
    for (const file of mdxFiles) {
        console.log(`📡 Fetching: ${file.name}`);
        const fileRes = await fetch(file.download_url);
        
        if (!fileRes.ok) throw new Error(`Failed to fetch ${file.name}`);
        
        const text = await fileRes.text();
        content += `\n\n--- SOURCE: ${file.html_url} ---\n\n` + text;
    }
    
    return { content, count: mdxFiles.length };
}

async function main() {
    const { values } = parseArgs({
        options: { framework: { type: 'string' } }
    });

    const targetFramework = values.framework;

    if (!targetFramework) {
        console.error(`❌ Please specify a framework using --framework=name`);
        process.exit(1);
    }

    console.log(`🤖 Compiling full context for: ${targetFramework}`);
    let masterContent = "";
    let fileCount = 0;

    try {
        if (targetFramework === 'tailwind') {
            const result = await fetchTailwindDocs();
            masterContent = result.content;
            fileCount = result.count;
        } else if (FRAMEWORK_SOURCES[targetFramework]) {
            const urls = FRAMEWORK_SOURCES[targetFramework];
            for (const url of urls) {
                console.log(`📡 Fetching: ${url}`);
                const response = await fetch(url);
                if (!response.ok) throw new Error(`Failed to fetch ${url}`);
                
                const text = await response.text();
                masterContent += `\n\n--- SOURCE: ${url} ---\n\n` + text;
            }
            fileCount = urls.length;
        } else {
            console.error(`❌ Invalid framework: ${targetFramework}`);
            process.exit(1);
        }

        const outputDir = path.join(process.cwd(), 'data', 'llms');
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        const outputPath = path.join(outputDir, `${targetFramework}.txt`);
        fs.writeFileSync(outputPath, masterContent);
        
        console.log(`✅ Compiled ${fileCount} files into ${outputPath}`);

    } catch (error) {
        console.error(`🚨 Error:`, error);
        process.exit(1);
    }
}

main();
