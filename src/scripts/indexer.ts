import * as fs from 'fs';
import * as path from 'path';
import { Language, Parser, Query } from 'web-tree-sitter';

// We use dynamic import for transformers in Node
async function runIndexer() {
    console.log("🚀 Starting Offline Context Canon Indexer...");

    const { pipeline, env } = await import('@xenova/transformers');
    env.allowLocalModels = true;
    const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });

    await Parser.init()
    const parser = new Parser();

    // The Polyglot Router: Map frameworks to their WASM parsers
    const wasmPaths: Record<string, string> = {
        'django': 'tree-sitter-python.wasm',
        'react': 'tree-sitter-tsx.wasm', // TSX handles both TS and JSX well
        'nextjs': 'tree-sitter-tsx.wasm',
        'node': 'tree-sitter-javascript.wasm',
    };

    // 🌟 THE FIX: Map frameworks to their specific AST syntax rules
    const queryMap: Record<string, string> = {
        'django': `
            (function_definition) @func
            (class_definition) @class
        `,
        'react': `
            (lexical_declaration) @decl
            (function_declaration) @func
            (arrow_function) @arrow
            (class_declaration) @class
        `,
        'nextjs': `
            (lexical_declaration) @decl
            (function_declaration) @func
            (arrow_function) @arrow
            (class_declaration) @class
        `,
        'node': `
            (lexical_declaration) @decl
            (function_declaration) @func
            (arrow_function) @arrow
            (class_declaration) @class
        `
    };

    const docsDir = path.join(__dirname, '../../data/llms');
    const files = fs.readdirSync(docsDir).filter(f => f.endsWith('.txt'));
    
    const finalIndex: any[] = [];

    for (const file of files) {
        const framework = file.replace('.txt', '').toLowerCase();
        
        if (!wasmPaths[framework]) continue; 

        console.log(`\n📚 Processing ${framework} using ${wasmPaths[framework]}`);
        
        const langWasm = await Language.load(path.join(__dirname, '../../parsers', wasmPaths[framework]));
        parser.setLanguage(langWasm);

        const rawDocs = fs.readFileSync(path.join(docsDir, file), 'utf8');
        const tree = parser.parse(rawDocs);
        
        // 🌟 THE FIX: Protect against null trees
        if (!tree) {
            console.warn(`⚠️ Warning: Parser returned null for ${file}. Skipping AST chunking.`);
            continue;
        }

        const lines = rawDocs.split('\n');

        // Use the language-specific query string
        const queryString = queryMap[framework] || queryMap['node'];
        const query = new Query(langWasm, queryString);

        const captures = query.captures(tree.rootNode);
        
        for (const capture of captures) {
            // Smart Window: 10 lines above to catch instructions like "jishjitsu_verified"
            const startRow = Math.max(0, capture.node.startPosition.row - 25);
            const endRow = Math.min(lines.length, capture.node.endPosition.row + 10);
            
            const chunkText = lines.slice(startRow, endRow).join('\n').trim();
            
            // Deduplication and size check
            if (chunkText.length > 100 && !finalIndex.find(idx => idx.content === chunkText)) {
                
                // Pre-calculate the embedding!
                const output = await extractor(chunkText, { pooling: 'mean', normalize: true });
                
                finalIndex.push({
                    id: `${framework}_${finalIndex.length}`,
                    content: chunkText,
                    embedding: Array.from(output.data), // Convert Float32Array to standard array for JSON
                    metadata: { framework }
                });
            }
        }
        
        // Cleanup the tree to prevent memory leaks in the CI runner
        tree.delete(); 
    }

    // Save the pre-baked vectors and chunks
    fs.writeFileSync(path.join(__dirname, '../../data/canon_index.json'), JSON.stringify(finalIndex));
    console.log(`\n✅ Indexing complete! Saved ${finalIndex.length} smart chunks to canon_index.json`);
}

runIndexer().catch(console.error);