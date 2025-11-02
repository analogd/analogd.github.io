#!/usr/bin/env node
// Loudspeaker Foundation API Server
// REST API wrapper for Foundation library with Swagger UI

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import yaml from 'js-yaml';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import sealedBoxRoutes from './routes/sealed-box.js';
import portedBoxRoutes from './routes/ported-box.js';
import utilitiesRoutes from './routes/utilities.js';
import { errorHandler } from './middleware/error-handler.js';

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load OpenAPI spec
const openApiPath = join(__dirname, 'openapi.yaml');
const openApiSpec = yaml.load(fs.readFileSync(openApiPath, 'utf8'));

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false  // Allow Swagger UI inline scripts
}));

// CORS - allow requests from browser
app.use(cors());

// JSON body parsing
app.use(express.json());

// Request logging (simple)
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'Loudspeaker Foundation API',
        version: '0.1.0',
        description: 'REST API for loudspeaker enclosure design based on Thiele-Small parameters',
        documentation: '/docs',
        endpoints: {
            docs: '/docs',
            openapi: '/openapi.json',
            api: '/api/v1'
        },
        foundation: {
            sources: [
                'Small 1972: Sealed box calculations',
                'Thiele 1971: Standard alignments',
                'Small 1973: Ported box calculations'
            ]
        }
    });
});

// Serve OpenAPI spec as JSON
app.get('/openapi.json', (req, res) => {
    res.json(openApiSpec);
});

// Swagger UI
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, {
    customSiteTitle: 'Loudspeaker Foundation API',
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        tryItOutEnabled: true
    }
}));

// API routes
app.use('/api/v1/sealed-box', sealedBoxRoutes);
app.use('/api/v1/ported-box', portedBoxRoutes);
app.use('/api/v1', utilitiesRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: {
            code: 'NOT_FOUND',
            message: `Endpoint not found: ${req.method} ${req.path}`,
            availableEndpoints: '/docs'
        }
    });
});

// Error handler (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔊 Loudspeaker Foundation API Server');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log(`📖 Documentation:    http://localhost:${PORT}/docs`);
    console.log(`🔗 API Endpoint:     http://localhost:${PORT}/api/v1`);
    console.log(`📋 OpenAPI Spec:     http://localhost:${PORT}/openapi.json`);
    console.log('');
    console.log('Foundation Sources:');
    console.log('  • Small 1972: Sealed box calculations');
    console.log('  • Thiele 1971: Standard alignments');
    console.log('  • Small 1973: Ported box calculations');
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
});

export default app;
