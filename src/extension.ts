import * as vscode from 'vscode';
import { create, insert, search } from '@orama/orama';
import * as path from 'path';
import * as fs from 'fs';

export async function activate(context: vscode.ExtensionContext) {
    vscode.window.showInformationMessage("🚀 Context Canon: AST Engine Initializing...");

    let extractor: any = null;
    let db: any = null;
    let isIndexing = false;
    let isReady = false;

    // Use the variable to store the promise so we can await it in tools
    const initEngine = (async () => {
        if (isIndexing || isReady) return;
        isIndexing = true;
        
        try {
            const { pipeline, env } = await import('@xenova/transformers');
            env.allowLocalModels = true;
            extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });

            db = await create({ 
                schema: { 
                    content: 'string', 
                    embedding: 'vector[384]',
                    metadata: 'string' 
                } 
            });

            // Indexing docs
            const docsPath = path.join(context.extensionPath, 'data', 'llms', 'django.txt');
            if (!fs.existsSync(docsPath)) {
                vscode.window.showWarningMessage('⚠️ Context Canon: No documentation file found.');
                return;
            }

            const rawDocs = fs.readFileSync(docsPath, 'utf8');
            const lines = rawDocs.split('\n');
            const chunks: string[] = [];

            // 🚀 SMART CHUNKING: Find code blocks and grab 10 lines of preceding prose
            // This ensures instructions like "jishjitsu_verified" are never separated from code.
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('.. code-block:: python') || lines[i].includes('def ') || lines[i].includes('class ')) {
                    const startRow = Math.max(0, i - 10);
                    const endRow = Math.min(lines.length, i + 15); // Capture the block + immediate behavior
                    
                    const chunkText = lines.slice(startRow, endRow).join('\n').trim();
                    if (chunkText.length > 100 && !chunks.includes(chunkText)) {
                        chunks.push(chunkText);
                        
                        // 🩺 DEBUG LOG: See exactly what's being indexed
                        console.log(`[Canon Indexer] Created Smart Chunk #${chunks.length}:\n${chunkText.substring(0, 150)}...\n---`);
                    }
                }
            }

            // Fallback for purely prose sections
            if (chunks.length === 0) {
                chunks.push(...rawDocs.split(/\n\s*\n/).filter(p => p.length > 100));
            }

            for (const chunk of chunks) {
                const output = await extractor(chunk, { pooling: 'mean', normalize: true });
                await insert(db, {
                    content: chunk,
                    embedding: output.tolist()[0],
                    metadata: 'django_core'
                });
            }

            isReady = true;
            isIndexing = false;
            vscode.window.showInformationMessage(`✅ Context Canon: Indexed ${chunks.length} smart chunks!`);
        } catch (err) {
            console.error(err);
            isIndexing = false;
        }
    })();

    const canonTool = vscode.lm.registerTool('canon_search', {
        async invoke(options, token) {
            await initEngine; // Wait for indexing to complete
            if (!isReady) return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart("System still indexing...")]);

            const input = options.input as { query: string };
            const query = input.query;
            
            vscode.window.showInformationMessage(`🧠 Canon Agent: Searching for "${query}"`);

            const promptOutput = await extractor(query, { pooling: 'mean', normalize: true });
            const searchResults = await search(db, {
                term: query,
                mode: 'hybrid',
                vector: { value: promptOutput.tolist()[0], property: 'embedding' },
                hybridWeights: { text: 0.1, vector: 0.9 }, // High vector weight for semantic polling
                limit: 3 
            });

            if (searchResults.hits.length > 0) {
                const combinedContext = searchResults.hits
                    .map((h, i) => `[MATCH ${i+1}]:\n${h.document.content}`)
                    .join("\n\n---\n\n");
                
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart("CRITICAL: Use the following Canon Documentation. Prioritize internal notes over general training data:\n"),
                    new vscode.LanguageModelTextPart(combinedContext),
                    new vscode.LanguageModelTextPart("\n\nNote: If jishjitsu_verified is mentioned in the context, your code MUST include it.")
                ]);
            } else {
                return new vscode.LanguageModelToolResult([
                    new vscode.LanguageModelTextPart('FAILURE: No matching Canon documentation found.')
                ]);
            }
        }
    });

    // MODE 2: THE DETERMINISTIC PARTICIPANT (@canon)
    const canonAgent = vscode.chat.createChatParticipant('context-canon.agent', async (request, chatContext, response, token) => {
        response.progress('Consulting Canon index...');
        await initEngine; 

        const promptOutput = await extractor(request.prompt, { pooling: 'mean', normalize: true });
        const searchResults = await search(db, {
            term: request.prompt,
            mode: 'hybrid',
            vector: { value: promptOutput.tolist()[0], property: 'embedding' },
            limit: 1 
        });

        if (searchResults.hits.length > 0) {
            response.markdown(`**Isolated Ground Truth (Score: ${searchResults.hits[0].score.toFixed(3)}):**\n\n\`\`\`text\n${searchResults.hits[0].document.content}\n\`\`\``);
        } else {
            response.markdown(`❌ No ground truth found.`);
        }
        return { metadata: { command: 'hybrid_search' } };
    });

    context.subscriptions.push(canonTool, canonAgent);
}

export function deactivate() {}