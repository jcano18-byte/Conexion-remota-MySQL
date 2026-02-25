const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

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

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} | ${req.method} ${req.path}`);
    if (req.method === 'POST') {
        console.log('Body recibido:', JSON.stringify(req.body));
    }
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

// Función para limpiar valores que BuilderBot no resolvió
// Si el valor contiene { } significa que la variable no se resolvió
function limpiar(valor) {
    if (!valor || typeof valor !== 'string') return null;
    if (valor.includes('{') && valor.includes('}')) return null;
    const limpio = valor.trim();
    return limpio === '' ? null : limpio;
}

// Función para parsear fecha de forma segura
function parsearFecha(valor) {
    if (!valor || typeof valor !== 'string') return new Date().toISOString().split('T')[0];
    if (valor.includes('{') && valor.includes('}')) return new Date().toISOString().split('T')[0];
    
    // Intentar parsear la fecha
    const fecha = new Date(valor);
    if (isNaN(fecha.getTime())) {
        return new Date().toISOString().split('T')[0]; // Si no es válida, usar hoy
    }
    return fecha.toISOString().split('T')[0];
}

// Función para parsear números de forma segura
function parsearNumero(valor, esDecimal) {
    if (!valor) return 0;
    const str = String(valor).replace(/[^0-9.-]/g, '');
    if (esDecimal) {
        return parseFloat(str) || 0;
    }
    return parseInt(str) || 0;
}

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

        // Limpiar valores
        const nombreLimpio = limpiar(Nombre);
        const productoLimpio = limpiar(Producto);
        const cantidadNum = parsearNumero(Cantidad, false);
        const totalNum = parsearNumero(Total, true);

        // Validar solo los campos esenciales después de limpiar
        if (!nombreLimpio || !productoLimpio) {
            return res.status(400).json({
                success: false,
                error: 'Campos requeridos faltantes: Nombre y Producto son obligatorios',
            });
        }

        const sql = `
            INSERT INTO presupuestos 
                (Nombre, Documento, Celular, Direccion, Codigo_producto, Producto, Color, Voltaje, Cantidad, Total, Fecha, created_at)
            VALUES 
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `;

        const valores = [
            nombreLimpio,
            limpiar(Documento),
            limpiar(Celular),
            limpiar(Direccion),
            limpiar(Codigo_producto),
            productoLimpio,
            limpiar(Color),
            limpiar(Voltaje),
            cantidadNum,
            totalNum,
            parsearFecha(Fecha),
        ];

        const [resultado] = await pool.execute(sql, valores);

        console.log(`✅ Venta #${resultado.insertId} | ${productoLimpio} x${cantidadNum} | $${totalNum}`);

        return res.status(201).json({
            success: true,
            message: 'Venta registrada exitosamente',
            data: {
                id: resultado.insertId,
                Nombre: nombreLimpio,
                Producto: productoLimpio,
                Cantidad: cantidadNum,
                Total: totalNum,
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
