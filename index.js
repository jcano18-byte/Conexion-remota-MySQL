const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// CONFIGURACIÓN (TiDB Cloud + TLS)
// ============================================
const DB_CONFIG = {
    host: process.env.DB_HOST || 'gateway01.us-east-1.prod.aws.tidbcloud.com',
    port: process.env.DB_PORT || 4000,
    user: process.env.DB_USER || '4Ms1N87uMddFY2Q.root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'germam',
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    ssl: {
        rejectUnauthorized: true,
    },
};

const API_KEY = process.env.API_KEY || 'cambiar_esta_clave';

const pool = mysql.createPool(DB_CONFIG);

// ============================================
// MIDDLEWARES
// ============================================
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} | ${req.method} ${req.path}`);
    next();
});

const verificarApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== API_KEY) {
        return res.status(401).json({
            success: false,
            error: 'API Key inválida o no proporcionada',
        });
    }
    next();
};

// ============================================
// RUTAS
// ============================================

app.get('/', (req, res) => {
    res.json({
        status: 'ok',
        service: 'API Ventas MAM',
        timestamp: new Date().toISOString(),
    });
});

app.get('/api/test-db', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT 1 AS connected');
        res.json({ success: true, message: 'Conexión a MySQL exitosa', data: rows[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: 'No se pudo conectar a MySQL', detalle: error.message });
    }
});

app.post('/api/ventas', verificarApiKey, async (req, res) => {
    try {
        const {
            Nombre,
            Documento,
            Celular,
            Direccion,
            Codigo_producto,
            Producto,
            Color,
            Voltaje,
            Cantidad,
            Total,
            Fecha,
        } = req.body;

        const requeridos = { Nombre, Producto, Cantidad, Total };
        const faltantes = Object.entries(requeridos)
            .filter(([_, v]) => v === undefined || v === null || v === '')
            .map(([k]) => k);

        if (faltantes.length > 0) {
            return res.status(400).json({
                success: false,
                error: `Campos requeridos faltantes: ${faltantes.join(', ')}`,
            });
        }

        const sql = `
            INSERT INTO presupuestos 
                (Nombre, Documento, Celular, Direccion, Codigo_producto, Producto, Color, Voltaje, Cantidad, Total, Fecha, created_at)
            VALUES 
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `;

        const valores = [
            Nombre,
            Documento || null,
            Celular || null,
            Direccion || null,
            Codigo_producto || null,
            Producto,
            Color || null,
            Voltaje || null,
            Cantidad,
            Total,
            Fecha || new Date().toISOString().split('T')[0],
        ];

        const [resultado] = await pool.execute(sql, valores);

        console.log(`✅ Venta #${resultado.insertId} | ${Producto} x${Cantidad} | $${Total}`);

        return res.status(201).json({
            success: true,
            message: 'Venta registrada exitosamente',
            data: {
                id: resultado.insertId,
                Nombre,
                Producto,
                Cantidad,
                Total,
            },
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
        return res.status(500).json({
            success: false,
            error: 'Error al registrar la venta',
            detalle: error.message,
        });
    }
});

app.get('/api/ventas', verificarApiKey, async (req, res) => {
    try {
        const [ventas] = await pool.execute(
            'SELECT * FROM presupuestos ORDER BY created_at DESC LIMIT 50'
        );
        res.json({ success: true, total: ventas.length, data: ventas });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/ventas/:id', verificarApiKey, async (req, res) => {
    try {
        const [ventas] = await pool.execute(
            'SELECT * FROM presupuestos WHERE id = ?',
            [req.params.id]
        );
        if (ventas.length === 0) {
            return res.status(404).json({ success: false, error: 'Venta no encontrada' });
        }
        res.json({ success: true, data: ventas[0] });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log('=========================================');
    console.log(`🚀 API Ventas MAM - Puerto ${PORT}`);
    console.log(`📍 POST /api/ventas → Registrar venta`);
    console.log(`📍 GET  /api/ventas → Listar ventas`);
    console.log('=========================================');
});
