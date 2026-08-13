require('dotenv').config();  

const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const helmet = require('helmet');
const bcrypt = require('bcrypt');
const ExcelJS = require('exceljs');
const fs = require('fs');
const app = express();
const rateLimit = require('express-rate-limit');
const port = 3000;
const saltRounds = 10;


app.use(session({
  secret: process.env.SESSION_SECRET,
  credentials:true,  
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production', 
    httpOnly: true,
    sameSite: 'lax'
  }
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN,  
}));

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Función para conectar a la base de datos con manejo de reconexión
let db;
function connectDB() {
    db = mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    db.connect(err => {
        if (err) {
            console.error('Error conectando a la base de datos:', err);
            setTimeout(connectDB, 5000); // Reintentar en 5 segundos
        } else {
            console.log('Conectado a la base de datos MySQL');
        }
    });

    db.on('error', err => {
        console.error('Error en la conexión MySQL:', err);
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            console.log('Intentando reconectar...');
            connectDB();
        } else {
            throw err;
        }
    });
}

connectDB(); // Conectar inicialmente

// Enviar un ping cada 5 minutos para evitar desconexión
setInterval(() => {
    if (db && db.ping) {
        db.ping(err => {
            if (err) {
                console.error('Error manteniendo la conexión activa:', err);
            } else {
                console.log('Ping enviado a MySQL para evitar desconexión');
            }
        });
    }
}, 300000); // Cada 5 minutos (300000 ms)

// Ruta para obtener los datos del usuario actual
app.get('/currentUser', (req, res) => {
  if (req.session.user) {
    res.json({ 
      cc: req.session.user.cc, 
      nombre: req.session.user.nombre, 
      rol: req.session.user.rol,
      sede: req.session.user.sede
    });
  } else {
    res.status(401).json({ error: 'No autenticado' });
  }
});


// Middleware para proteger rutas
function isAuthenticated(req, res, next) {
  if (req.session.user) {
    return next();
  }
  res.redirect('/');
}

function isAdmin(req, res, next) {
  if (req.session.user && req.session.user.rol === 'ADMIN') {
    return next();
  }
  res.status(403).send('Acceso denegado');
}
// se desactivo la funcion para lider
function isLider(req, res, next) {
  if (req.session && req.session.user) {
    console.log('Usuario autenticado:', req.session.user); 
    if (req.session.user.rol === 'LIDER') {  
      return next();
    } else {
      console.log('Acceso denegado: el usuario no tiene el rol de LIDER');
      return res.status(403).json({ error: 'Acceso denegado: no tienes permiso para realizar esta acción' });
    }
  } else {
    console.log('Acceso denegado: no hay usuario autenticado');
    return res.status(403).json({ error: 'Acceso denegado: no estás autenticado' });
  }
}

function isLiderOrAdmin(req, res, next) {
  if (req.session && req.session.user) {
    console.log('Usuario autenticado:', req.session.user);
    if (req.session.user.rol === 'LIDER' || req.session.user.rol === 'ADMIN') {
      return next();
    } else {
      console.log('Acceso denegado: el usuario no tiene el rol adecuado');
      return res.status(403).json({ error: 'Acceso denegado: no tienes permiso para realizar esta acción' });
    }
  } else {
    console.log('Acceso denegado: no hay usuario autenticado');
    return res.status(403).json({ error: 'Acceso denegado: no estás autenticado' });
  }
}

function isTecnica(req, res, next) {
  if (req.session.user && (req.session.user.rol === 'TECNICA' || req.session.user.rol === 'LIDER' || req.session.user.rol === 'ADMIN' || req.session.user.rol === 'CALIDAD')) {
    return next();
  }
  res.redirect('/');
}

function isTecnicaOnly(req, res, next) {
  if (req.session && req.session.user && req.session.user.rol === 'TECNICA') {
    return next();
  } else {
    console.log('Acceso denegado: solo el rol TECNICA puede realizar esta acción');
    return res.status(403).json({ error: 'Acceso denegado: solo el rol TECNICA puede realizar esta acción' });
  }
}




// Rutas para usuarios (solo accesibles por ADMIN)
app.get('/users', isAuthenticated, isAdmin, (req, res) => {
  db.query('SELECT * FROM users', (err, results) => {
    if (err) {
      console.error('Error al obtener usuarios:', err);
      return res.status(500).send('Error en el servidor');
    }
    res.json(results);  
  });
});

app.get('/users/:id', isAuthenticated, isAdmin, (req, res) => {
  const { id } = req.params;
  db.query('SELECT * FROM users WHERE id = ?', [id], (err, results) => {
    if (err) {
      console.error('Error al obtener usuario:', err);
      return res.status(500).send('Error en el servidor');
    }
    if (results.length > 0) {
      res.json(results[0]);  
    } else {
      res.status(404).json({ message: 'Usuario no encontrado' });
    }
  });
});

// Ruta para crear usuario (con encriptación de contraseña)
app.post('/users', isAuthenticated, isAdmin, async (req, res) => {
  const { cc, nombre, contrasena, rol, sede } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(contrasena, saltRounds);
    db.query('INSERT INTO users (cc, nombre, contrasena, rol, sede) VALUES (?, ?, ?, ?, ?)', 
      [cc, nombre, hashedPassword, rol, sede], 
      (err, results) => {
        if (err) {
          console.error('Error al crear usuario:', err);
          return res.status(500).send('Error en el servidor');
        }
        res.status(201).send('Usuario creado');
    });
  } catch (error) {
    console.error('Error al encriptar la contraseña:', error);
    res.status(500).send('Error en el servidor');
  }
});

// Ruta para actualizar usuario (con encriptación de contraseña)
app.put('/users/:id', isAuthenticated, isAdmin, async (req, res) => {
  const { id } = req.params;
  const { cc, nombre, contrasena, rol, sede } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(contrasena, saltRounds);
    db.query('UPDATE users SET cc = ?, nombre = ?, contrasena = ?, rol = ?, sede = ? WHERE id = ?', 
      [cc, nombre, hashedPassword, rol, sede, id], 
      (err, results) => {
        if (err) {
          console.error('Error al actualizar usuario:', err);
          return res.status(500).send('Error en el servidor');
        }
        res.send('Usuario actualizado');
    });
  } catch (error) {
    console.error('Error al encriptar la contraseña:', error);
    res.status(500).send('Error en el servidor');
  }
});

// Ruta para eliminar usuario
app.delete('/users/:id', isAuthenticated, isAdmin, (req, res) => {
  const { id } = req.params;
  db.query('DELETE FROM users WHERE id = ?', [id], (err, results) => {
    if (err) {
      console.error('Error al eliminar usuario:', err);
      return res.status(500).send('Error en el servidor');
    }
    res.send('Usuario eliminado');
  });
});

// ENDPOINT PARA LOGIN
app.post('/login', (req, res) => {
  const { cc, contrasena } = req.body;

  db.query('SELECT * FROM users WHERE cc = ?', [cc], async (err, results) => {
    if (err) {
      console.error('Error al iniciar sesión:', err);
      return res.status(500).json({ success: false, message: 'Error en el servidor' });
    }

    if (results.length > 0) {
      const user = results[0];

      const isPasswordEncrypted = user.contrasena.startsWith('$2b$');
      if (isPasswordEncrypted) {
        const match = await bcrypt.compare(contrasena, user.contrasena);
        if (!match) {
          return res.status(200).json({ success: false, message: 'Usuario o contraseña incorrectos' });
        }
      } else {
        if (contrasena !== user.contrasena) {
          return res.status(200).json({ success: false, message: 'Usuario o contraseña incorrectos' });
        }
      }

      req.session.user = {
        id: user.id,
        cc: user.cc,
        nombre: user.nombre,
        rol: user.rol,
        sede: user.sede
      };

      if (user.rol === 'ADMIN') {
        return res.status(200).json({ success: true, redirect: '/admin' });
      } else if (['TECNICA', 'LIDER', 'CALIDAD'].includes(user.rol)) {
        return res.status(200).json({ success: true, redirect: '/TecnicaReal' });
      } else {
        return res.status(200).json({ success: false, message: 'Rol no autorizado' });
      }
    } else {
      return res.status(200).json({ success: false, message: 'Usuario o contraseña incorrectos' });
    }
  });
});

// Ruta para verificar autenticación
app.get('/checkAuth', (req, res) => {
  if (req.session.user) {
    res.status(200).send('Autenticado');
  } else {
    res.status(401).send('No autenticado');
  }
});

// Ruta para logout
app.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Error al cerrar sesión:', err);
      return res.status(500).send('Error en el servidor');
    }
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

// Ruta para obtener los módulos cliente a los que un usuario tiene acceso (accesible por LIDER, TECNICA y CALIDAD)
app.get('/moduloscliente', isAuthenticated, (req, res) => {
  const userId = req.session.user.id;
  const userRol = req.session.user.rol;
  const subModuloId = req.query.subModuloId;

  // Obtener IP real (incluyendo si estás detrás de proxy)
  const userIP = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;

  console.log(`ID "${userId}" ROL "${userRol}" IP "${userIP}"`);

  // Lógica de acceso según el rol...
  if (userRol === 'TECNICA') {
    const query = `
      SELECT m.* FROM moduloscliente m
      JOIN modulo_tecnica mt ON mt.modulo_id = m.id
      WHERE mt.usuario_id = ? AND m.id_submodulo = ?`;

    db.query(query, [userId, subModuloId], (error, results) => {
      if (error) return res.status(500).json({ message: 'Error al cargar módulos' });
      res.json(results);
    });

  } else if (userRol === 'CALIDAD') {
    const query = `
      SELECT m.* FROM moduloscliente m
      JOIN modulo_calidad mc ON mc.modulo_id = m.id
      WHERE mc.usuario_id = ? AND m.id_submodulo = ?`;

    db.query(query, [userId, subModuloId], (error, results) => {
      if (error) return res.status(500).json({ message: 'Error al cargar módulos' });
      res.json(results);
    });

  } else if (userRol === 'LIDER' || userRol === 'ADMIN') {
    const query = 'SELECT * FROM moduloscliente WHERE id_submodulo = ?';
    db.query(query, [subModuloId], (error, results) => {
      if (error) return res.status(500).json({ message: 'Error al cargar módulos' });
      res.json(results);
    });

  } else {
    res.status(403).json({ message: 'Acceso no permitido' });
  }
});


// Ruta para actualizar un módulo cliente
app.put('/moduloscliente/:id', isAuthenticated, isLiderOrAdmin, (req, res) => {
  const { id } = req.params;
  const { codigo,  entidad_remitente, acta_transferencia_modulo , fecha_trans_modulo} = req.body;

  // Asegúrate de que todos los campos requeridos se envían
  if (!codigo || !entidad_remitente || !acta_transferencia_modulo ||!fecha_trans_modulo ) {
      return res.status(400).send('Faltan campos requeridos');
  }

  const query = 'UPDATE moduloscliente SET codigo = ?,  entidad_remitente = ?, acta_transferencia_modulo = ?, fecha_trans_modulo = ? WHERE id = ?';
  db.query(query, [codigo, entidad_remitente, acta_transferencia_modulo, fecha_trans_modulo,id], (err, results) => {
      if (err) {
          console.error('Error al actualizar módulo cliente:', err);
          return res.status(500).send('Error al actualizar módulo cliente');
      }
      res.send('Módulo cliente actualizado');
  });
});

// Ruta para eliminar un módulo cliente
app.delete('/moduloscliente/:id', isAuthenticated, isLiderOrAdmin, (req, res) => {
  const { id } = req.params;

  const query = 'DELETE FROM moduloscliente WHERE id = ?';
  db.query(query, [id], (err, results) => {
      if (err) {
          console.error('Error al eliminar módulo cliente:', err);
          return res.status(500).send('Error al eliminar módulo cliente');
      }
      res.send('Módulo cliente eliminado');
  });
});



// Ruta para crear un nuevo módulo cliente (solo accesible por LIDER)
app.post('/moduloscliente', isAuthenticated, isLiderOrAdmin, (req, res) => {
  const { codigo, entidad_remitente, acta_transferencia_modulo,fecha_trans_modulo ,id_submodulo } = req.body;  // Añadido el id_submodulo

  if (!codigo ||  !entidad_remitente ||! acta_transferencia_modulo || !fecha_trans_modulo || !id_submodulo) {
    return res.status(400).send('Faltan campos requeridos');
  }

  const query = 'INSERT INTO moduloscliente (codigo,  entidad_remitente,acta_transferencia_modulo, fecha_trans_modulo,id_submodulo) VALUES (?, ?, ?, ?,?)';
  db.query(query, [codigo,  entidad_remitente,  acta_transferencia_modulo,fecha_trans_modulo ,id_submodulo], (err, results) => {
    if (err) {
      console.error('Error al crear módulo cliente:', err);
      return res.status(500).send('Error al crear módulo cliente');
    }
    res.status(201).send('Módulo cliente creado');
  });
});

// Ruta para actualizar un módulo cliente (solo accesible por LIDER)
app.put('/moduloscliente/:id', isAuthenticated, isLiderOrAdmin, (req, res) => {
  const { id } = req.params;
  const { codigo,  entidad_remitente,  acta_transferencia_modulo,fecha_trans_modulo ,id_submodulo } = req.body;  // Añadido el id_submodulo

  if (!codigo ||  !entidad_remitente || !acta_transferencia_modulo ||!fecha_trans_modulo ||!id_submodulo) {
    return res.status(400).send('Faltan campos requeridos');
  }

  const query = 'UPDATE moduloscliente SET codigo = ?,  entidad_remitente = ?, acta_transferencia_modulo = ?,fecha_trans_modulo = ? ,id_submodulo = ? WHERE id = ?';
  db.query(query, [codigo,  entidad_remitente,  acta_transferencia_modulo, id_submodulo,fecha_trans_modulo, id], (err, results) => {
    if (err) {
      console.error('Error al actualizar módulo cliente:', err);
      return res.status(500).send('Error al actualizar módulo cliente');
    }
    res.send('Módulo cliente actualizado');
  });
});

// Ruta para obtener los usuarios con rol "TECNICA" o "CALIDAD"
app.get('/usuarios/:rol', (req, res) => {
  const sedeLider = req.query.sede; 
  const rol = req.params.rol.toUpperCase();

  const query = `SELECT * FROM users WHERE rol = ? AND sede = ?`;

  db.query(query, [rol, sedeLider], (error, results) => {
    if (error) {
      console.error(`Error al obtener usuarios ${rol}:`, error);
      res.status(500).json({ error: `Error al obtener usuarios ${rol}` });
      return;
    }

    res.json(results); 
  });
});


// Ruta para agregar usuarios TECNICA o CALIDAD a un módulo de moduloscliente
app.post('/moduloscliente/:moduloId/agregar', (req, res) => {
  const { usuarios } = req.body;
  const { moduloId } = req.params;
  const { rol } = req.query;

  if (!usuarios || usuarios.length === 0) {
    return res.status(400).json({ message: 'No se enviaron usuarios para agregar' });
  }

  const tablaRelacion = rol === 'calidad' ? 'modulo_calidad' : 'modulo_tecnica';

  const query = `INSERT INTO ${tablaRelacion} (modulo_id, usuario_id) VALUES ?`;
  const values = usuarios.map(usuarioId => [moduloId, usuarioId]);

  db.query(query, [values], (error, results) => {
    if (error) {
      console.error(`Error al agregar usuarios ${rol} al módulo:`, error);
      return res.status(500).json({ message: `Error al agregar usuarios ${rol} al módulo` });
    }
    res.json({ message: `Usuarios ${rol} agregados correctamente` });
  });
});

// Ruta para eliminar usuarios TECNICA o CALIDAD de un módulo de moduloscliente
app.post('/moduloscliente/:moduloId/eliminar', (req, res) => {
  const { usuarios } = req.body;
  const { moduloId } = req.params;
  const { rol } = req.query;

  if (!usuarios || usuarios.length === 0) {
    return res.status(400).json({ message: 'No se enviaron usuarios para eliminar' });
  }

  const tablaRelacion = rol === 'calidad' ? 'modulo_calidad' : 'modulo_tecnica';

  const query = `DELETE FROM ${tablaRelacion} WHERE modulo_id = ? AND usuario_id IN (?)`;

  db.query(query, [moduloId, usuarios], (error, results) => {
    if (error) {
      console.error(`Error al eliminar usuarios ${rol} del módulo:`, error);
      return res.status(500).json({ message: `Error al eliminar usuarios ${rol} del módulo` });
    }
    res.json({ message: `Usuarios ${rol} eliminados correctamente` });
  });
});


// Ruta para agregar usuarios TECNICA o CALIDAD a un módulo de moduloscliente
app.post('/moduloscliente/:moduloId/agregar', (req, res) => {
  const { usuarios } = req.body; // Los IDs de los usuarios seleccionados
  const { moduloId } = req.params; // El ID del módulo
  const { rol } = req.query; // Rol (tecnica o calidad)

  if (!usuarios || usuarios.length === 0) {
    return res.status(400).json({ message: 'No se enviaron usuarios para agregar' });
  }

  const tablaRelacion = rol === 'calidad' ? 'modulo_calidad' : 'modulo_tecnica';

  // Insertar en la tabla correspondiente (modulo_tecnica o modulo_calidad)
  const query = `INSERT INTO ${tablaRelacion} (modulo_id, usuario_id) VALUES ?`;
  const values = usuarios.map(usuarioId => [moduloId, usuarioId]);

  db.query(query, [values], (error, results) => {
    if (error) {
      console.error(`Error al agregar usuarios ${rol} al módulo:`, error);
      return res.status(500).json({ message: `Error al agregar usuarios ${rol} al módulo` });
    }
    res.json({ message: `Usuarios ${rol} agregados correctamente` });
  });
});

// Ruta para eliminar usuarios TECNICA o CALIDAD de un módulo de modulosclient
app.post('/moduloscliente/:moduloId/eliminar', (req, res) => {
  const { usuarios } = req.body; // Los IDs de los usuarios seleccionados
  const { moduloId } = req.params; // El ID del módulo
  const { rol } = req.query; // Rol (tecnica o calidad)

  if (!usuarios || usuarios.length === 0) {
    return res.status(400).json({ message: 'No se enviaron usuarios para eliminar' });
  }

  const tablaRelacion = rol === 'calidad' ? 'modulo_calidad' : 'modulo_tecnica';

  // Eliminar los usuarios seleccionados de la tabla correspondiente (modulo_tecnica o modulo_calidad)
  const query = `DELETE FROM ${tablaRelacion} WHERE modulo_id = ? AND usuario_id IN (?)`;
  
  db.query(query, [moduloId, usuarios], (error, results) => {
    if (error) {
      console.error(`Error al eliminar usuarios ${rol} del módulo:`, error);
      return res.status(500).json({ message: `Error al eliminar usuarios ${rol} del módulo` });
    }
    res.json({ message: `Usuarios ${rol} eliminados correctamente` });
  });
});

// Ruta para obtener usuarios TECNICA o CALIDAD asignados a un módulo
app.get('/moduloscliente/:moduloId/usuarios', isAuthenticated, isLiderOrAdmin, (req, res) => {
  const { moduloId } = req.params;
  const { rol } = req.query; // Rol (tecnica o calidad)

  const tablaRelacion = rol === 'calidad' ? 'modulo_calidad' : 'modulo_tecnica';

  const query = `
    SELECT u.id, u.nombre, u.sede
    FROM users u
    JOIN ${tablaRelacion} mt ON u.id = mt.usuario_id
    WHERE mt.modulo_id = ? AND u.rol = ?`;

  db.query(query, [moduloId, rol.toUpperCase()], (error, results) => {
    if (error) {
      console.error(`Error al obtener usuarios ${rol} asignados al módulo:`, error);
      return res.status(500).json({ message: `Error al obtener usuarios ${rol} asignados al módulo` });
    }

    res.json(results); // Devuelve los usuarios asignados al módulo
  });
});


// ================= SUB MÓDULOS =================

// Obtener sub-módulos según rol y sede del usuario
app.get('/sub_modulos', isAuthenticated, (req, res) => {
  const { rol, id, sede } = req.session.user; // Obtenemos la sede del usuario
  let query = '';
  let queryParams = [];

  // LIDER y ADMIN solo ven sub-módulos de su sede
  if (rol === 'LIDER' || rol === 'ADMIN') {
    query = 'SELECT * FROM sub_modulos WHERE sede_submodulos = ?';
    queryParams = [sede];
  } 
  // TECNICA ve solo los sub-módulos asignados a él y de su sede
  else if (rol === 'TECNICA') {
    query = `
      SELECT sm.* FROM sub_modulos sm
      JOIN asignacion_tecnica at ON sm.id = at.modulo_id
      WHERE at.usuario_id = ? AND sm.sede_submodulos = ?
    `;
    queryParams = [id, sede];
  } 
  // CALIDAD ve solo los sub-módulos asignados a él y de su sede
  else if (rol === 'CALIDAD') {
    query = `
      SELECT sm.* FROM sub_modulos sm
      JOIN asignacion_calidad ac ON sm.id = ac.modulo_id
      WHERE ac.usuario_id = ? AND sm.sede_submodulos = ?
    `;
    queryParams = [id, sede];
  } 
  else {
    return res.status(403).json({ message: 'Rol no autorizado' });
  }

  db.query(query, queryParams, (error, results) => {
    if (error) {
      console.error('Error al obtener sub-módulos:', error);
      return res.status(500).json({ message: 'Error al obtener sub-módulos' });
    }
    res.json(results);
  });
});

// Crear un nuevo sub-módulo
app.post('/sub_modulos', isAuthenticated, isLiderOrAdmin, (req, res) => {
  const { codigo, entidad_remitente } = req.body;
  const sede_submodulos = req.session.user.sede; // Tomamos la sede del usuario logueado

  if (!codigo || !entidad_remitente) {
    return res.status(400).send('Faltan campos requeridos');
  }

  const query = 'INSERT INTO sub_modulos (codigo, entidad_remitente, sede_submodulos) VALUES (?, ?, ?)';
  db.query(query, [codigo, entidad_remitente, sede_submodulos], (error, results) => {
    if (error) {
      console.error('Error al crear sub-módulo:', error);
      return res.status(500).send('Error al crear sub-módulo');
    }
    res.status(201).send('Sub-módulo creado correctamente');
  });
});

// Actualizar un sub-módulo
app.put('/sub_modulos/:id', isAuthenticated, isLiderOrAdmin, (req, res) => {
  const { id } = req.params;
  const { codigo, entidad_remitente } = req.body;
  const sede_submodulos = req.session.user.sede; // También actualizamos la sede

  if (!codigo || !entidad_remitente) {
    return res.status(400).send('Faltan campos requeridos');
  }

  const query = 'UPDATE sub_modulos SET codigo = ?, entidad_remitente = ?, sede_submodulos = ? WHERE id = ?';
  db.query(query, [codigo, entidad_remitente, sede_submodulos, id], (error, results) => {
    if (error) {
      console.error('Error al actualizar sub-módulo:', error);
      return res.status(500).send('Error al actualizar sub-módulo');
    }
    res.send('Sub-módulo actualizado correctamente');
  });
});

// Eliminar un sub-módulo
app.delete('/sub_modulos/:id', isAuthenticated, isLiderOrAdmin, (req, res) => {
  const { id } = req.params;
  const query = 'DELETE FROM sub_modulos WHERE id = ?';
  db.query(query, [id], (error, results) => {
    if (error) {
      console.error('Error al eliminar sub-módulo:', error);
      return res.status(500).send('Error al eliminar sub-módulo');
    }
    res.send('Sub-módulo eliminado correctamente');
  });
});



// Obtener los datos de fuiddatosreal según el rol
app.get('/fuiddatosreal', isAuthenticated, (req, res) => {
  // Verifica que la sesión y el usuario existan antes de continuar
  if (!req.session || !req.session.user) {
    return res.status(403).send('Acceso denegado: usuario no autenticado');
  }

  const userRole = req.session.user.rol;
  const userCC = req.session.user.cc;

  // LIDER, CALIDAD y ADMIN pueden ver todos los registros
  if (userRole === 'LIDER' || userRole === 'CALIDAD' || userRole === 'ADMIN') {
    db.query('SELECT * FROM fuiddatosreal', (err, results) => {
      if (err) {
        return res.status(500).json({ error: 'Error al obtener datos', message: err.message });
      }
      res.json(results);
    });
  } else if (userRole === 'TECNICA') {
    // TECNICA solo puede ver los registros que ha creado
    const nombreCompleto = `${req.session.user.nombre} (${userCC})`;

    // Depuración: Verificar qué nombre completo se está utilizando en la consulta
    console.log(`Consultando registros para: ${nombreCompleto}`);

    db.query('SELECT * FROM fuiddatosreal WHERE elaborado_por = ?', [nombreCompleto], (err, results) => {
      if (err) {
        return res.status(500).json({ error: 'Error al obtener datos', message: err.message });
      }
      res.json(results);
    });
  } else {
    res.status(403).send('Acceso denegado');
  }
});

app.post('/fuiddatosreal', isAuthenticated, (req, res) => {
  const { 
    fecha_del_dato, n_orden, codigo, entidad_remitente, entidad_productora, unidad_administrativa, oficina_productora, objeto, 
    serie, subserie, 
    numero_de_orden_interno, accionado_procesado, accionado_denunciante, identificacion, 
    asunto, radicado, numero_doc, numero_doc_hasta, fecha_inicial, fecha_final, caja, upd, tomo, otro, caja_interna,
    folios, soporte, frecuencia, elaborado_por, nro_acta_transferible, fecha_transferencia, notas, sede, tiempo, 
    historial_y_cambios, cambio_calidad, sede_calidad, asunto_2, asunto_3 
  } = req.body;
  
  const currentUser = req.session.user;

  // Verificar si el usuario tiene permisos
  if (currentUser.rol !== 'LIDER' && currentUser.rol !== 'ADMIN' && currentUser.rol !== 'TECNICA') {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  db.beginTransaction(err => {
    if (err) {
      console.error('Error al iniciar transacción:', err.message);
      return res.status(500).json({ error: 'Error al iniciar transacción', message: err.message });
    }

    const checkUpdSql = 'SELECT COUNT(*) AS count FROM fuiddatosreal WHERE upd = ?';
    db.query(checkUpdSql, [upd], (err, results) => {
      if (err) {
        console.error('Error al verificar el campo UPD:', err.message);
        db.rollback();
        return res.status(500).json({ error: 'Error al verificar el campo UPD', message: err.message });
      }

      const count = results[0].count;
      if (count > 0) {
        db.rollback();
        return res.status(400).json({ error: 'El valor de UPD ya existe en la base de datos' });
      }

      // Valores en el mismo orden que las columnas
      const values = [
        fecha_del_dato, n_orden, codigo, entidad_remitente, entidad_productora, unidad_administrativa,
        oficina_productora, objeto, serie, subserie, 
        numero_de_orden_interno, accionado_procesado, accionado_denunciante, identificacion, // 🔽 Nuevos
        asunto, radicado, numero_doc, numero_doc_hasta, fecha_inicial || null, fecha_final || null, caja,
        upd, tomo, otro, caja_interna, folios || null, soporte, frecuencia, elaborado_por,
        nro_acta_transferible || null, fecha_transferencia || null, notas, sede, tiempo, historial_y_cambios, 
        cambio_calidad, sede_calidad, asunto_2, asunto_3
      ];

      const sql = `
        INSERT INTO fuiddatosreal (
          fecha_del_dato, n_orden, codigo, entidad_remitente, entidad_productora, unidad_administrativa, oficina_productora, objeto, 
          serie, subserie, 
          numero_de_orden_interno, accionado_procesado, accionado_denunciante, identificacion, 
          asunto, radicado, numero_doc, numero_doc_hasta, fecha_inicial, fecha_final, caja, upd, tomo, otro, caja_interna, 
          folios, soporte, frecuencia, elaborado_por, nro_acta_transferible, fecha_transferencia, notas, sede, tiempo, 
          historial_y_cambios, cambio_calidad, sede_calidad, asunto_2, asunto_3
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?,?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          fecha_del_dato = VALUES(fecha_del_dato), n_orden = VALUES(n_orden), codigo = VALUES(codigo),
          entidad_remitente = VALUES(entidad_remitente), entidad_productora = VALUES(entidad_productora), 
          unidad_administrativa = VALUES(unidad_administrativa), oficina_productora = VALUES(oficina_productora),
          objeto = VALUES(objeto), serie = VALUES(serie), subserie = VALUES(subserie),
          numero_de_orden_interno = VALUES(numero_de_orden_interno), 
          accionado_procesado = VALUES(accionado_procesado), 
          accionado_denunciante = VALUES(accionado_denunciante), 
          identificacion = VALUES(identificacion), 
          asunto = VALUES(asunto), radicado = VALUES(radicado), numero_doc = VALUES(numero_doc), 
          numero_doc_hasta = VALUES(numero_doc_hasta), fecha_inicial = VALUES(fecha_inicial), fecha_final = VALUES(fecha_final), 
          caja = VALUES(caja), upd = VALUES(upd), tomo = VALUES(tomo), otro = VALUES(otro),
          caja_interna = VALUES(caja_interna), folios = VALUES(folios), soporte = VALUES(soporte), frecuencia = VALUES(frecuencia),
          elaborado_por = VALUES(elaborado_por), nro_acta_transferible = VALUES(nro_acta_transferible), 
          fecha_transferencia = VALUES(fecha_transferencia), notas = VALUES(notas), sede = VALUES(sede), tiempo = VALUES(tiempo),
          historial_y_cambios = VALUES(historial_y_cambios), cambio_calidad = VALUES(cambio_calidad), 
          sede_calidad = VALUES(sede_calidad), asunto_2 = VALUES(asunto_2), asunto_3 = VALUES(asunto_3)
      `;

      db.query(sql, values, (err) => {
        if (err) {
          console.error('Error al insertar o actualizar el registro:', err.message);
          db.rollback();
          return res.status(500).json({ error: 'Error al insertar o actualizar el registro', message: err.message });
        }

        db.commit(err => {
          if (err) {
            console.error('Error al confirmar transacción:', err.message);
            db.rollback();
            return res.status(500).json({ error: 'Error al confirmar la transacción', message: err.message });
          }

          res.status(200).json({ message: 'Registro insertado o actualizado correctamente' });
        });
      });
    });
  });
});



// Ruta para obtener un registro por ID
app.get('/fuiddatosreal/:id', isAuthenticated, (req, res) => {
  const id = req.params.id;
  const sql = 'SELECT * FROM fuiddatosreal WHERE id = ?';
  db.query(sql, [id], (err, results) => {
    if (err) { 
      console.error('Error al obtener el registro:', err.message); 
      return res.status(500).json({ error: 'Error al obtener el registro', message: err.message }); 
    }
    res.json(results);
  });
});


// Ruta para actualizar un registro
app.put('/fuiddatosreal/:id', isAuthenticated, (req, res) => {
  const id = req.params.id;
  const {
    fecha_del_dato, n_orden, codigo, entidad_remitente, entidad_productora, unidad_administrativa,
    oficina_productora, objeto, serie, subserie, numero_de_orden_interno, accionado_procesado, 
    accionado_denunciante, identificacion, asunto, radicado, numero_doc, numero_doc_hasta,
    fecha_inicial, fecha_final, caja, upd, tomo, otro, caja_interna, folios, soporte, frecuencia,
    elaborado_por, nro_acta_transferible, fecha_transferencia, notas, sede, tiempo,
    historial_y_cambios, cambio_calidad, sede_calidad, asunto_2, asunto_3
  } = req.body;

  console.log('Datos recibidos para actualización:', req.body);

  const { cc, rol } = req.session.user;
  const nombreCompletoMayus = `${req.session.user.nombre.toUpperCase()} (${cc})`;

  db.query('SELECT * FROM fuiddatosreal WHERE id = ?', [id], (err, results) => {
    if (err) {
      console.error('Error al verificar registro:', err.message);
      return res.status(500).json({ error: 'Error al verificar registro', message: err.message });
    }

    // Permitir solo que LIDER, ADMIN, CALIDAD o el creador del registro lo modifique
    if (
      results.length === 0 ||
      (rol !== 'LIDER' && rol !== 'ADMIN' && rol !== 'CALIDAD' &&
        results[0].elaborado_por.toUpperCase() !== nombreCompletoMayus)
    ) {
      return res.status(403).json({ error: 'No autorizado para actualizar este registro' });
    }

    const values = [
      fecha_del_dato || null, n_orden || null, codigo || null, entidad_remitente || null,
      entidad_productora || null, unidad_administrativa || null, oficina_productora || null,
      objeto || null, serie || null, subserie || null, numero_de_orden_interno || null,
      accionado_procesado || null, accionado_denunciante || null, identificacion || null,
      asunto || null, radicado || null, numero_doc || null, numero_doc_hasta || null, 
      fecha_inicial || null, fecha_final || null, caja || null, upd || null, tomo || null, 
      otro || null, caja_interna || null, folios || null, soporte || null, frecuencia || null, 
      elaborado_por || null, nro_acta_transferible || null, fecha_transferencia || null, 
      notas || null, sede || null, tiempo || null, historial_y_cambios || null, 
      cambio_calidad || null, sede_calidad || null, asunto_2 || null, asunto_3 || null,
      id
    ];

    const sql = `
      UPDATE fuiddatosreal SET
        fecha_del_dato = ?, n_orden = ?, codigo = ?, entidad_remitente = ?, entidad_productora = ?, 
        unidad_administrativa = ?, oficina_productora = ?, objeto = ?, serie = ?, subserie = ?, 
        numero_de_orden_interno = ?, accionado_procesado = ?, accionado_denunciante = ?, 
        identificacion = ?, asunto = ?, radicado = ?, numero_doc = ?, numero_doc_hasta = ?, 
        fecha_inicial = ?, fecha_final = ?, caja = ?, upd = ?, tomo = ?, otro = ?, caja_interna = ?, 
        folios = ?, soporte = ?, frecuencia = ?, elaborado_por = ?, nro_acta_transferible = ?, 
        fecha_transferencia = ?, notas = ?, sede = ?, tiempo = ?, historial_y_cambios = ?, 
        cambio_calidad = ?, sede_calidad = ?, asunto_2 = ?, asunto_3 = ?
      WHERE id = ?
    `;

    db.query(sql, values, (err, result) => {
      if (err) {
        console.error('Error al actualizar el registro:', err.message);
        return res.status(500).json({ error: 'Error al actualizar el registro', message: err.message });
      }
      console.log('Resultado de la actualización:', result);
      res.status(200).json({ message: 'Registro actualizado' });
    });
  });
});


// Ruta para eliminar un registro
app.delete('/fuiddatosreal/:id', isAuthenticated, (req, res) => {
  const id = req.params.id;
  const { cc, rol } = req.session.user;
  const nombreCompletoMayus = `${req.session.user.nombre.toUpperCase()} (${cc})`;

  db.query('SELECT * FROM fuiddatosreal WHERE id = ?', [id], (err, results) => {
    if (err) {
      console.error('Error al verificar registro:', err.message);
      return res.status(500).json({ error: 'Error al verificar registro', message: err.message });
    }
    if (results.length === 0 || (rol !== 'LIDER'   && rol !== 'ADMIN' && rol !== 'CALIDAD' && results[0].elaborado_por.toUpperCase() !== nombreCompletoMayus)) {
      return res.status(403).json({ error: 'No autorizado para eliminar este registro' });
    }

    db.query('DELETE FROM fuiddatosreal WHERE id = ?', [id], err => {
      if (err) {
        console.error('Error al eliminar el registro:', err.message);
        return res.status(500).json({ error: 'Error al eliminar el registro', message: err.message });
      }
      res.status(200).json({ message: 'Registro eliminado' });
    });
  });
});


//IMPLEMENTACION DE AUTOCOMPLETADO

app.get('/fuiddatosreal/:caja/suggestions/:campo', (req, res) => {
  const { caja, campo } = req.params;
  const { q } = req.query;

  console.log('Caja recibida:', caja);
  console.log('Campo recibido:', campo);
  console.log('Valor de búsqueda (q):', q);

  // Asegurarse de que solo ciertos campos puedan ser autocompletados
  const camposValidos = ['entidad_productora', 'codigo','unidad_administrativa', 'oficina_productora', 'objeto', 'serie','asunto_2' ,'subserie',
      'radicado','numero_doc','numero_doc_hasta','caja_interna','notas'];

  if (!q || !caja || !camposValidos.includes(campo)) {
      return res.status(400).json({ error: 'Datos incompletos o campo no válido' });
  }

  // Consulta SQL para obtener las sugerencias dinámicamente según el campo
  const query = `SELECT DISTINCT ${campo} 
                 FROM fuiddatosreal 
                 WHERE caja = ? 
                 AND ${campo} LIKE ? 
                 LIMIT 8`;

  db.query(query, [caja, `${q}%`], (error, rows) => {
      if (error) {
          console.error(`Error al obtener sugerencias para el campo ${campo}:`, error.message);
          return res.status(500).json({ error: `Error interno del servidor al obtener sugerencias para ${campo}` });
      }

      console.log(`Contenido de rows para ${campo}:`, rows);

      // En lugar de devolver un error, devolver un array vacío si no hay sugerencias
      if (rows.length === 0) {
          return res.json([]);  // Devolver un array vacío en lugar de un error 404
      }

      // Extraer las sugerencias de las filas
      const suggestions = rows.map(row => row[campo]);

      console.log(`Sugerencias devueltas para ${campo}:`, suggestions);
      res.json(suggestions);
  });
});

app.post('/fuiddatosreal/:caja/:campo', (req, res) => {
  const { caja, campo } = req.params;
  const { valor } = req.body;

  // Lista de campos válidos para autocompletado
  const camposValidos = ['entidad_productora', 'codigo','unidad_administrativa', 'oficina_productora', 'objeto', 'serie','asunto_2' ,
    'subserie',  'radicado','numero_doc','numero_doc_hasta','caja_interna','notas'];

  if (!valor || !caja || !camposValidos.includes(campo)) {
      return res.status(400).json({ error: 'Datos incompletos o campo no válido' });
  }

  try {
      // Verificar si ya existe el valor para el campo dado en la base de datos
      const checkQuery = `SELECT COUNT(*) as count 
                          FROM fuiddatosreal 
                          WHERE caja = ? 
                          AND ${campo} = ?`;

      db.query(checkQuery, [caja, valor], (err, result) => {
          if (err) {
              console.error(`Error al verificar el campo ${campo}:`, err.message);
              return res.status(500).json({ error: `Error interno del servidor al verificar el campo ${campo}` });
          }

          const count = result[0].count;

          if (count === 0) {
              // Si no existe, insertar el nuevo valor en la base de datos
              const insertQuery = `INSERT INTO fuiddatosreal (caja, ${campo}) 
                                   VALUES (?, ?)`;

              db.query(insertQuery, [caja, valor], (err, result) => {
                  if (err) {
                      console.error(`Error al guardar el valor en ${campo}:`, err.message);
                      return res.status(500).json({ error: `Error interno del servidor al guardar el valor en ${campo}` });
                  }

                  res.status(201).json({ message: `Valor guardado en ${campo}` });
              });
          } else {
              res.status(200).json({ message: `El valor ya existe en ${campo}` });
          }
      });
  } catch (error) {
      console.error(`Error al guardar el valor en ${campo}:`, error.message);
      res.status(500).json({ error: `Error interno del servidor al guardar el valor en ${campo}` });
  }
});


///


// Ruta para obtener los datos del historial
app.get('/api/historial', isAuthenticated,  isLiderOrAdmin, (req, res) => {
  const sql = 'SELECT * FROM historial';
  db.query(sql, (err, results) => {
      if (err) {
          console.error('Error al obtener los datos:', err);
          res.status(500).send('Error al obtener los datos');
          return;
      }
      res.json(results);  // Enviar los datos como JSON
  });
});

// CONEXIÓN INVENTARIO

// Obtener todos los registros del inventario
app.get('/inventario',  isLiderOrAdmin, (req, res) => {
  const query = 'SELECT * FROM inventario';
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error en la consulta a la base de datos:', err.message);
      return res.status(500).json({ error: 'Error al consultar la base de datos', message: err.message });
    }
    res.json(results);
  });
});

// Obtener un registro específico por ID
app.get('/inventario/:id',  isLiderOrAdmin, (req, res) => {
  const { id } = req.params;
  const query = 'SELECT * FROM inventario WHERE ITEMS = ?';
  db.query(query, [id], (err, result) => {
    if (err) {
      console.error('Error en la consulta a la base de datos:', err.message);
      return res.status(500).json({ error: 'Error al consultar la base de datos', message: err.message });
    }
    if (result.length === 0) {
      return res.status(404).json({ error: 'Registro no encontrado' });
    }
    res.json(result[0]);
  });
});

// Agregar un nuevo registro al inventario
app.post('/inventario',  isLiderOrAdmin, (req, res) => {
  const {
    CODIGO_DEL_CLIENTE, CLIENTE, No_ACTA, FECHA_TRANSFERENCIA, X200, X300, X400, NC, TOTAL_CAJAS, ANEXOS,
    FECHA_ENTREGA_CUSTODIA, FUNCIONARIO, ESTADO_DEL_INVENTARIO, CAJAS_PROCESADAS, CAJA_INICIAR, CAJ_FIN,
    REGISTROS_PROCESADOS, FECHA_ENTREGA, INICIO_INVENTARIO, FIN_INVENTARIO, ESTADO_ENTREGA, MES_ENTREGA_PACA
  } = req.body;

  const query = `INSERT INTO inventario (CODIGO_DEL_CLIENTE, CLIENTE, No_ACTA, FECHA_TRANSFERENCIA, X200, X300, X400, NC, TOTAL_CAJAS,
    ANEXOS, FECHA_ENTREGA_CUSTODIA, FUNCIONARIO, ESTADO_DEL_INVENTARIO, CAJAS_PROCESADAS, CAJA_INICIAR, CAJ_FIN, REGISTROS_PROCESADOS,
    FECHA_ENTREGA, INICIO_INVENTARIO, FIN_INVENTARIO, ESTADO_ENTREGA, MES_ENTREGA_PACA)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  const values = [
    CODIGO_DEL_CLIENTE, CLIENTE, No_ACTA, FECHA_TRANSFERENCIA || null, X200 || null, X300 || null, X400 || null, NC || null,
    TOTAL_CAJAS || null, ANEXOS, FECHA_ENTREGA_CUSTODIA || null, FUNCIONARIO, ESTADO_DEL_INVENTARIO, CAJAS_PROCESADAS || null,
    CAJA_INICIAR, CAJ_FIN, REGISTROS_PROCESADOS || null, FECHA_ENTREGA || null, INICIO_INVENTARIO || null, FIN_INVENTARIO || null,
    ESTADO_ENTREGA, MES_ENTREGA_PACA
  ];

  db.query(query, values, (err, result) => {
    if (err) {
      console.error('Error al insertar el registro:', err.message);
      return res.status(500).json({ error: 'Error al insertar el registro', message: err.message });
    }
    res.json({ message: 'Registro insertado correctamente', id: result.insertId });
  });
});

// Actualizar un registro existente en el inventario
app.put('/inventario/:id',  isLiderOrAdmin, (req, res) => {
  const { id } = req.params;
  const {
    CODIGO_DEL_CLIENTE, CLIENTE, No_ACTA, FECHA_TRANSFERENCIA, X200, X300, X400, NC, TOTAL_CAJAS, ANEXOS,
    FECHA_ENTREGA_CUSTODIA, FUNCIONARIO, ESTADO_DEL_INVENTARIO, CAJAS_PROCESADAS, CAJA_INICIAR, CAJ_FIN,
    REGISTROS_PROCESADOS, FECHA_ENTREGA, INICIO_INVENTARIO, FIN_INVENTARIO, ESTADO_ENTREGA, MES_ENTREGA_PACA
  } = req.body;

  const query = `UPDATE inventario SET
    CODIGO_DEL_CLIENTE = ?, CLIENTE = ?, No_ACTA = ?, FECHA_TRANSFERENCIA = ?, X200 = ?, X300 = ?, X400 = ?, NC = ?, TOTAL_CAJAS = ?, ANEXOS = ?,
    FECHA_ENTREGA_CUSTODIA = ?, FUNCIONARIO = ?, ESTADO_DEL_INVENTARIO = ?, CAJAS_PROCESADAS = ?, CAJA_INICIAR = ?, CAJ_FIN = ?,
    REGISTROS_PROCESADOS = ?, FECHA_ENTREGA = ?, INICIO_INVENTARIO = ?, FIN_INVENTARIO = ?, ESTADO_ENTREGA = ?, MES_ENTREGA_PACA = ?
    WHERE ITEMS = ?`;

  const values = [
    CODIGO_DEL_CLIENTE, CLIENTE, No_ACTA, FECHA_TRANSFERENCIA || null, X200 || null, X300 || null, X400 || null, NC || null,
    TOTAL_CAJAS || null, ANEXOS, FECHA_ENTREGA_CUSTODIA || null, FUNCIONARIO, ESTADO_DEL_INVENTARIO, CAJAS_PROCESADAS || null,
    CAJA_INICIAR, CAJ_FIN, REGISTROS_PROCESADOS || null, FECHA_ENTREGA || null, INICIO_INVENTARIO || null, FIN_INVENTARIO || null,
    ESTADO_ENTREGA, MES_ENTREGA_PACA, id
  ];

  db.query(query, values, (err) => {
    if (err) {
      console.error('Error al actualizar el registro:', err.message);
      return res.status(500).json({ error: 'Error al actualizar el registro', message: err.message });
    }
    res.json({ message: `Registro con ID: ${id} actualizado correctamente` });
  });
});

// Eliminar un registro del inventario
app.delete('/inventario/:id',  isLiderOrAdmin, (req, res) => {
  const { id } = req.params;
  const query = 'DELETE FROM inventario WHERE ITEMS = ?';

  db.query(query, [id], (err) => {
    if (err) {
      console.error('Error al eliminar el registro:', err.message);
      return res.status(500).json({ error: 'Error al eliminar el registro', message: err.message });
    }
    res.json({ message: `Registro con ID: ${id} eliminado` });
  });
});

// Obtener usuarios por rol (TECNICA o CALIDAD) y sede
app.get('/usuarios/:rol', isAuthenticated, (req, res) => {
  const sedeLider = req.query.sede; // Sede se obtiene del query param en la URL
  const rol = req.params.rol.toUpperCase();

  const query = 'SELECT * FROM users WHERE rol = ? AND sede = ?';
  db.query(query, [rol, sedeLider], (error, results) => {
      if (error) {
          console.error(`Error al obtener usuarios ${rol}:`, error);
          return res.status(500).json({ message: `Error al obtener usuarios ${rol}` });
      }
      res.json(results);
  });
});

// Asignar usuarios a un sub-módulo (TECNICA)
app.post('/asignacion_tecnica', isAuthenticated, isLiderOrAdmin, (req, res) => {
  const { modulo_id, usuarios } = req.body;

  if (!modulo_id) {
      return res.status(400).json({ message: 'El campo modulo_id es requerido' });
  }

  if (!usuarios || usuarios.length === 0) {
      return res.status(400).json({ message: 'No se enviaron usuarios para asignar' });
  }

  const query = 'INSERT INTO asignacion_tecnica (modulo_id, usuario_id) VALUES ?';
  const values = usuarios.map(usuarioId => [modulo_id, usuarioId]);

  db.query(query, [values], (error, results) => {
      if (error) {
          console.error('Error al asignar usuarios a técnica:', error);
          return res.status(500).json({ message: 'Error al asignar usuarios a técnica' });
      }
      res.json({ message: 'Usuarios asignados correctamente a técnica' });
  });
});

// Eliminar usuarios de un sub-módulo (TECNICA)
app.post('/asignacion_tecnica/:modulo_id/eliminar', isAuthenticated, isLiderOrAdmin, (req, res) => {
  const { usuarios } = req.body;
  const { modulo_id } = req.params;

  if (!usuarios || usuarios.length === 0) {
      return res.status(400).json({ message: 'No se enviaron usuarios para eliminar' });
  }

  // Verificar si los usuarios están realmente asignados
  const placeholders = usuarios.map(() => '?').join(',');
  const queryExist = `SELECT * FROM asignacion_tecnica WHERE modulo_id = ? AND usuario_id IN (${placeholders})`;
  
  db.query(queryExist, [modulo_id, ...usuarios], (error, results) => {
      if (error) {
          console.error('Error al verificar asignaciones:', error);
          return res.status(500).json({ message: 'Error al verificar asignaciones de técnica' });
      }

      if (results.length === 0) {
          return res.status(404).json({ message: 'No se encontraron usuarios asignados para eliminar' });
      }

      // Eliminar usuarios si están asignados
      const queryDelete = `DELETE FROM asignacion_tecnica WHERE modulo_id = ? AND usuario_id IN (${placeholders})`;
      db.query(queryDelete, [modulo_id, ...usuarios], (error, results) => {
          if (error) {
              console.error('Error al eliminar usuarios de técnica:', error);
              return res.status(500).json({ message: 'Error al eliminar usuarios de técnica' });
          }
          res.json({ message: 'Usuarios eliminados correctamente de técnica' });
      });
  });
});

// Obtener usuarios asignados a un sub-módulo por rol (TECNICA)
app.get('/asignacion_tecnica/:modulo_id/usuarios', isAuthenticated, (req, res) => {
  const { modulo_id } = req.params;

  const query = `
      SELECT u.id, u.nombre, u.sede
      FROM users u
      JOIN asignacion_tecnica at ON u.id = at.usuario_id
      WHERE at.modulo_id = ?
  `;

  db.query(query, [modulo_id], (error, results) => {
      if (error) {
          console.error('Error al obtener usuarios asignados a técnica:', error);
          return res.status(500).json({ message: 'Error al obtener usuarios asignados a técnica' });
      }
      res.json(results);
  });
});

// Asignar usuarios a un sub-módulo para CALIDAD
app.post('/asignacion_calidad', isAuthenticated, isLiderOrAdmin, (req, res) => {
  const { modulo_id, usuarios } = req.body;

  if (!modulo_id) {
      return res.status(400).json({ message: 'El campo modulo_id es requerido' });
  }

  if (!usuarios || usuarios.length === 0) {
      return res.status(400).json({ message: 'No se enviaron usuarios para asignar' });
  }

  const query = 'INSERT INTO asignacion_calidad (modulo_id, usuario_id) VALUES ?';
  const values = usuarios.map(usuarioId => [modulo_id, usuarioId]);

  db.query(query, [values], (error, results) => {
      if (error) {
          console.error('Error al asignar usuarios a calidad:', error);
          return res.status(500).json({ message: 'Error al asignar usuarios a calidad' });
      }
      res.json({ message: 'Usuarios asignados correctamente a calidad' });
  });
});

// Eliminar usuarios de un sub-módulo (CALIDAD)
app.post('/asignacion_calidad/:modulo_id/eliminar', isAuthenticated, isLiderOrAdmin, (req, res) => {
  const { usuarios } = req.body;  // IDs de los usuarios a eliminar
  const { modulo_id } = req.params;

  if (!usuarios || usuarios.length === 0) {
      return res.status(400).json({ message: 'No se enviaron usuarios para eliminar' });
  }

  // Verificar si los usuarios están realmente asignados
  const placeholders = usuarios.map(() => '?').join(',');
  const queryExist = `SELECT * FROM asignacion_calidad WHERE modulo_id = ? AND usuario_id IN (${placeholders})`;
  
  db.query(queryExist, [modulo_id, ...usuarios], (error, results) => {
      if (error) {
          console.error('Error al verificar asignaciones:', error);
          return res.status(500).json({ message: 'Error al verificar asignaciones de calidad' });
      }

      if (results.length === 0) {
          return res.status(404).json({ message: 'No se encontraron usuarios asignados para eliminar' });
      }

      // Eliminar usuarios si están asignados
      const queryDelete = `DELETE FROM asignacion_calidad WHERE modulo_id = ? AND usuario_id IN (${placeholders})`;
      db.query(queryDelete, [modulo_id, ...usuarios], (error, results) => {
          if (error) {
              console.error('Error al eliminar usuarios de calidad:', error);
              return res.status(500).json({ message: 'Error al eliminar usuarios de calidad' });
          }
          res.json({ message: 'Usuarios eliminados correctamente de calidad' });
      });
  });
});

// Obtener usuarios asignados a un sub-módulo (CALIDAD)
app.get('/asignacion_calidad/:modulo_id/usuarios', isAuthenticated, (req, res) => {
  const { modulo_id } = req.params;

  const query = `
      SELECT u.id, u.nombre, u.sede
      FROM users u
      JOIN asignacion_calidad ac ON u.id = ac.usuario_id
      WHERE ac.modulo_id = ?
  `;

  db.query(query, [modulo_id], (error, results) => {
      if (error) {
          console.error('Error al obtener usuarios asignados a calidad:', error);
          return res.status(500).json({ message: 'Error al obtener usuarios asignados a calidad' });
      }
      res.json(results);
  });
});



// Endpoint para obtener los módulos asociados a un sub-módulo específico
// Obtener módulos de caja asociados a un módulo cliente
// Obtener módulos de caja asociados a un módulo cliente
app.get('/modulos_caja', isAuthenticated, (req, res) => {
  const { rol, id } = req.session.user;
  const { id_modulo_caja } = req.query;  // Se espera 'id_modulo_caja' en la consulta

  if (!id_modulo_caja) {
    return res.status(400).json({ message: 'El campo id_modulo_caja es requerido' });
  }

  let query = '';
  let queryParams = [id_modulo_caja];

  if (rol === 'LIDER' || rol === 'ADMIN') {
    query = 'SELECT * FROM modulos_caja WHERE id_modulo_caja = ?';
  } else if (rol === 'TECNICA') {
    query = `
      SELECT mc.* FROM modulos_caja mc
      JOIN asignacion_caja_tecnica act ON mc.id = act.modulo_id
      WHERE act.usuario_id = ? AND mc.id_modulo_caja = ?
    `;
    queryParams.unshift(id);
  } else if (rol === 'CALIDAD') {
    query = `
      SELECT mc.* FROM modulos_caja mc
      JOIN asignacion_caja_calidad ac ON mc.id = ac.modulo_id
      WHERE ac.usuario_id = ? AND mc.id_modulo_caja = ?
    `;
    queryParams.unshift(id);
  } else {
    return res.status(403).json({ message: 'No tienes permiso para acceder a estos datos' });
  }

  db.query(query, queryParams, (error, results) => {
    if (error) {
      console.error('Error al obtener módulos de caja:', error);
      return res.status(500).json({ message: 'Error al obtener módulos de caja' });
    }
    res.json(results);
  });
});

// Crear un nuevo módulo de caja
app.post('/modulos_caja', isAuthenticated, isLiderOrAdmin, (req, res) => {
  const {
    caja_modulo,

    entidad_remitente_caja,
    acta_trans_caja,
    fecha_trans_caja,
    id_modulo_caja,
    entidad_productora_caja,
    unidad_administrativa_caja,
    oficina_productora_caja,
    objeto_caja,
    estado_caja
  } = req.body;

  if (
    !caja_modulo || !entidad_remitente_caja || !acta_trans_caja ||
    !fecha_trans_caja || !id_modulo_caja || !entidad_productora_caja ||
    !unidad_administrativa_caja || !oficina_productora_caja || !objeto_caja || !estado_caja
  ) {
    return res.status(400).send('Faltan campos requeridos');
  }

  const query = `
    INSERT INTO modulos_caja (
      caja_modulo,  entidad_remitente_caja, acta_trans_caja,
      fecha_trans_caja, id_modulo_caja, entidad_productora_caja,
      unidad_administrativa_caja, oficina_productora_caja, objeto_caja, estado_caja
    ) VALUES (?, ?, ?,  ?, ?, ?, ?, ?, ?, ?)
  `;
  
  db.query(query, [
    caja_modulo,  entidad_remitente_caja, acta_trans_caja,
    fecha_trans_caja, id_modulo_caja, entidad_productora_caja,
    unidad_administrativa_caja, oficina_productora_caja, objeto_caja, estado_caja
  ], (error, results) => {
    if (error) {
      console.error('Error al crear módulo de caja:', error);
      return res.status(500).send('Error al crear módulo de caja');
    }

    const insertedId = results.insertId;
    res.status(201).json({
      message: 'Módulo de caja creado correctamente',
      modulo: {
        id: insertedId,
        caja_modulo,  entidad_remitente_caja, acta_trans_caja,
        fecha_trans_caja, id_modulo_caja, entidad_productora_caja,
        unidad_administrativa_caja, oficina_productora_caja, objeto_caja, estado_caja
      }
    });
  });
});

// Actualizar un módulo de caja
app.put('/modulos_caja/:id', isAuthenticated, isLiderOrAdmin, (req, res) => {
  const { id } = req.params;
  const {
    caja_modulo,  entidad_remitente_caja, acta_trans_caja,
    fecha_trans_caja, entidad_productora_caja, unidad_administrativa_caja,
    oficina_productora_caja, objeto_caja, estado_caja
  } = req.body;

  if (
    !caja_modulo  || !entidad_remitente_caja || !acta_trans_caja ||
    !fecha_trans_caja || !entidad_productora_caja || !unidad_administrativa_caja ||
    !oficina_productora_caja || !objeto_caja || !estado_caja
  ) {
    return res.status(400).send('Faltan campos requeridos');
  }

  const query = `
    UPDATE modulos_caja 
    SET caja_modulo = ?,  entidad_remitente_caja = ?, acta_trans_caja = ?, 
        fecha_trans_caja = ?, entidad_productora_caja = ?, unidad_administrativa_caja = ?, 
        oficina_productora_caja = ?, objeto_caja = ?, estado_caja = ?
    WHERE id = ?
  `;
  
  db.query(query, [
    caja_modulo,  entidad_remitente_caja, acta_trans_caja,
    fecha_trans_caja, entidad_productora_caja, unidad_administrativa_caja,
    oficina_productora_caja, objeto_caja, estado_caja, id
  ], (error, results) => {
    if (error) {
      console.error('Error al actualizar módulo de caja:', error);
      return res.status(500).send('Error al actualizar módulo de caja');
    }
    res.send('Módulo de caja actualizado correctamente');
  });
});

// Eliminar un módulo de caja
app.delete('/modulos_caja/:id', isAuthenticated, isLiderOrAdmin, (req, res) => {
  const { id } = req.params;

  const query = 'DELETE FROM modulos_caja WHERE id = ?';
  db.query(query, [id], (error, results) => {
    if (error) {
      console.error('Error al eliminar módulo de caja:', error);
      return res.status(500).send('Error al eliminar módulo de caja');
    }
    res.send('Módulo de caja eliminado correctamente');
  });
});

app.patch('/modulos_caja/:id/cambiarEstado', isAuthenticated, isTecnicaOnly, (req, res) => {
  const { id } = req.params;
  const { estado_caja } = req.body;

  if (!estado_caja) {
    return res.status(400).json({ message: 'El campo estado_caja es requerido' });
  }

  const query = `
    UPDATE modulos_caja 
    SET estado_caja = ? 
    WHERE id = ?
  `;

  db.query(query, [estado_caja, id], (error, results) => {
    if (error) {
      console.error('Error al cambiar el estado del módulo de caja:', error);
      // Enviar mensaje de error con detalles específicos del error
      return res.status(500).json({ message: 'Hubo un error al cambiar el estado', error: error.message });
    }
    res.json({ message: `Estado cambiado a ${estado_caja} correctamente` });
  });
});



// Obtener usuarios por rol y sede
app.get('/usuarios/:rol', isAuthenticated, (req, res) => {
  const { sede } = req.query;
  const rol = req.params.rol.toUpperCase();

  if (!sede) {
    return res.status(400).json({ message: 'El parámetro sede es requerido' });
  }

  const query = 'SELECT * FROM users WHERE rol = ? AND sede = ?';
  db.query(query, [rol, sede], (error, results) => {
    if (error) {
      console.error(`Error al obtener usuarios del rol ${rol}:`, error);
      return res.status(500).json({ message: `Error al obtener usuarios del rol ${rol}` });
    }
    res.json(results);
  });
});

// Asignar usuarios a un módulo de caja (TECNICA)
app.post('/asignacion_caja_tecnica', isAuthenticated, isLiderOrAdmin, (req, res) => {
  const { modulo_id, usuarios } = req.body;

  if (!modulo_id || !usuarios || usuarios.length === 0) {
    return res.status(400).json({
      message: 'El campo modulo_id y la lista de usuarios son requeridos',
    });
  }

  const query = 'INSERT INTO asignacion_caja_tecnica (modulo_id, usuario_id) VALUES ?';
  const values = usuarios.map(usuarioId => [modulo_id, usuarioId]);

  db.query(query, [values], (error) => {
    if (error) {
      console.error('Error al asignar usuarios a técnica:', error);
      return res.status(500).json({ message: 'Error al asignar usuarios a técnica' });
    }
    res.json({ message: 'Usuarios asignados correctamente a técnica' });
  });
});

// Eliminar usuarios de un módulo de caja (TECNICA)
app.post('/asignacion_caja_tecnica/:modulo_id/eliminar', isAuthenticated, isLiderOrAdmin, (req, res) => {
  const { usuarios } = req.body;
  const { modulo_id } = req.params;

  if (!usuarios || usuarios.length === 0) {
    return res.status(400).json({
      message: 'No se enviaron usuarios para eliminar',
    });
  }

  const query = 'DELETE FROM asignacion_caja_tecnica WHERE modulo_id = ? AND usuario_id IN (?)';
  db.query(query, [modulo_id, usuarios], (error) => {
    if (error) {
      console.error('Error al eliminar usuarios de técnica:', error);
      return res.status(500).json({ message: 'Error al eliminar usuarios de técnica' });
    }
    res.json({ message: 'Usuarios eliminados correctamente de técnica' });
  });
});

// Obtener usuarios asignados a un módulo de caja (TECNICA)
app.get('/modulos_caja/:modulo_id/usuarios', isAuthenticated, (req, res) => {
  const { modulo_id } = req.params;

  const query = `
    SELECT u.id, u.nombre, u.sede
    FROM users u
    JOIN asignacion_caja_tecnica act ON u.id = act.usuario_id
    WHERE act.modulo_id = ?
  `;

  db.query(query, [modulo_id], (error, results) => {
    if (error) {
      console.error('Error al obtener usuarios asignados a técnica:', error);
      return res.status(500).json({ message: 'Error al obtener usuarios asignados a técnica' });
    }
    res.json(results);
  });
});

// Asignar usuarios a un módulo de caja (CALIDAD)
app.post('/asignacion_caja_calidad', isAuthenticated, isLiderOrAdmin, (req, res) => {
  const { modulo_id, usuarios } = req.body;

  if (!modulo_id || !usuarios || usuarios.length === 0) {
    return res.status(400).json({
      message: 'El campo modulo_id y la lista de usuarios son requeridos',
    });
  }

  const query = 'INSERT INTO asignacion_caja_calidad (modulo_id, usuario_id) VALUES ?';
  const values = usuarios.map(usuarioId => [modulo_id, usuarioId]);

  db.query(query, [values], (error) => {
    if (error) {
      console.error('Error al asignar usuarios a calidad:', error);
      return res.status(500).json({ message: 'Error al asignar usuarios a calidad' });
    }
    res.json({ message: 'Usuarios asignados correctamente a calidad' });
  });
});

// Eliminar usuarios de un módulo de caja (CALIDAD)
app.post('/asignacion_caja_calidad/:modulo_id/eliminar', isAuthenticated, isLiderOrAdmin, (req, res) => {
  const { usuarios } = req.body;
  const { modulo_id } = req.params;

  if (!usuarios || usuarios.length === 0) {
    return res.status(400).json({
      message: 'No se enviaron usuarios para eliminar',
    });
  }

  const query = 'DELETE FROM asignacion_caja_calidad WHERE modulo_id = ? AND usuario_id IN (?)';
  db.query(query, [modulo_id, usuarios], (error) => {
    if (error) {
      console.error('Error al eliminar usuarios de calidad:', error);
      return res.status(500).json({ message: 'Error al eliminar usuarios de calidad' });
    }
    res.json({ message: 'Usuarios eliminados correctamente de calidad' });
  });
});

// Obtener usuarios asignados a un módulo de caja (CALIDAD)
app.get('/modulos_caja_calidad/:modulo_id/usuarios', isAuthenticated, (req, res) => {
  const { modulo_id } = req.params;

  const query = `
    SELECT u.id, u.nombre, u.sede
    FROM users u
    JOIN asignacion_caja_calidad acc ON u.id = acc.usuario_id
    WHERE acc.modulo_id = ?
  `;

  db.query(query, [modulo_id], (error, results) => {
    if (error) {
      console.error('Error al obtener usuarios asignados a calidad:', error);
      return res.status(500).json({ message: 'Error al obtener usuarios asignados a calidad' });
    }
    res.json(results);
  });
});



// asignacion de cajas multiples a usuarios  (CALIDAD)
app.post('/asignacion_caja_calidad/rango', isAuthenticated, isLiderOrAdmin, (req, res) => {
  const { modulo_id, usuarios, rango_inicio, rango_fin } = req.body;

  // Validación de campos requeridos
  if (!modulo_id || !usuarios || usuarios.length === 0 || !rango_inicio || !rango_fin) {
    return res.status(400).json({
      message: 'El campo modulo_id, usuarios, rango_inicio y rango_fin son requeridos',
    });
  }

  // Verificación de formato de cajas
  const regex = /^\d{3}C\d{6}$/;
  if (!regex.test(rango_inicio) || !regex.test(rango_fin)) {
    return res.status(400).json({
      message: 'El rango de cajas debe seguir el formato correcto ',
    });
  }

  // Extraer prefijos y sufijos como cadenas
  const inicioPrefix = rango_inicio.slice(0, 4); // Prefijo de la caja inicio
  const finPrefix = rango_fin.slice(0, 4); // Prefijo de la caja fin
  const inicioSuffix = rango_inicio.slice(4); // Sufijo de la caja inicio (como texto)
  const finSuffix = rango_fin.slice(4); // Sufijo de la caja fin (como texto)

  // Verificación de rangos
  if (inicioPrefix !== finPrefix || inicioSuffix > finSuffix) {
    return res.status(400).json({
      message: 'El rango de cajas no es válido, asegúrese de que "Desde" no sea mayor que "Hasta"',
    });
  }

  // Generar cajas dentro del rango
  const cajas = [];
  let currentSuffix = inicioSuffix;

  while (currentSuffix <= finSuffix) {
    const caja = `${inicioPrefix}${currentSuffix}`;
    cajas.push(caja);

    // Incrementar el sufijo como texto
    currentSuffix = (parseInt(currentSuffix, 10) + 1).toString().padStart(6, '0');
  }

  console.log("Rango de cajas generado:", cajas); // Ver todas las cajas generadas

  // Consultar las cajas generadas en la base de datos
  const queryCajas = 'SELECT id FROM modulos_caja WHERE caja_modulo IN (?)';
  console.log("Consultando las siguientes cajas en la base de datos:", cajas); // Log para verificar las cajas consultadas en la DB
  db.query(queryCajas, [cajas], (error, results) => {
    if (error) {
      console.error('Error al obtener las cajas:', error);
      return res.status(500).json({ message: 'Error al obtener las cajas del módulo' });
    }
    console.log("Resultados de la consulta:", results); // Log para depuración
    if (results.length === 0) {
      return res.status(404).json({ message: 'No se encontraron cajas en el rango especificado' });
    }

    // Preparar los valores para la inserción
    const values = [];
    usuarios.forEach(usuarioId => {
      results.forEach(caja => {
        values.push([caja.id, usuarioId]);
      });
    });

    // Insertar la asignación de cajas
    const queryInsert = 'INSERT INTO asignacion_caja_calidad (modulo_id, usuario_id) VALUES ?';
    db.query(queryInsert, [values], (insertError) => {
      if (insertError) {
        console.error('Error al asignar cajas:', insertError);
        return res.status(500).json({ message: 'Error al asignar las cajas' });
      }
      return res.status(200).json({ message: 'Cajas asignadas correctamente a los usuarios de calidad' });
    });
  });
});







app.get('/modulos_caja/count_fuiddatosreal', (req, res) => {
  const cajaModulo = req.query.caja_modulo;

  if (!cajaModulo) {
      return res.status(400).json({ error: 'caja_modulo es requerido' });
  }

  const query = `
      SELECT COUNT(*) AS total_registros
      FROM fuiddatosreal
      WHERE caja = ?
  `;

  db.execute(query, [cajaModulo], (err, results) => {
      if (err) {
          console.error('Error al contar los registros:', err);
          return res.status(500).json({ error: 'Error al contar los registros' });
      }

      res.json({ total: results[0].total_registros });
  });
});


app.get('/moduloscliente/count_cajas', (req, res) => {
    const moduloClienteId = req.query.modulo_cliente_id;

    if (!moduloClienteId) {
        return res.status(400).json({ error: 'modulo_cliente_id es requerido' });
    }

    const query = `
        SELECT COUNT(*) AS total_cajas
        FROM fuiddatosluciernaga.modulos_caja
        WHERE id_modulo_caja = ?
    `;

    db.execute(query, [moduloClienteId], (err, results) => {
        if (err) {
            console.error('Error al contar las cajas:', err);
            return res.status(500).json({ error: 'Error al contar las cajas' });
        }
        const totalCajas = results[0].total_cajas || 0;
        res.json({ total: totalCajas });
    });
});


// endpoints para la plantilla de excel
app.post('/generarPlantilla', async (req, res) => {
  try {
      const { fileName, filtros } = req.body;  // Obtener los filtros
      console.log('Filtros recibidos:', filtros);  // Verificar que los filtros se reciben correctamente

      // Ruta de la plantilla y del archivo generado
      const templatePath = path.join(__dirname, 'public', 'plantilla', 'PLANTILLA.xlsx');
      const outputPath = path.join(__dirname, 'public', 'temp', `${fileName}.xlsx`);

      // Verificar si la plantilla existe
      if (!fs.existsSync(templatePath)) {
          console.error(`La plantilla no existe en: ${templatePath}`);
          return res.status(400).json({ error: 'La plantilla no existe.' });
      }

      console.log('Leyendo la plantilla...');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(templatePath);

      // Construir la consulta SQL con los filtros
      let query = `SELECT 
          n_orden, codigo, entidad_remitente, entidad_productora, 
          unidad_administrativa, oficina_productora, objeto, serie, subserie, 
          asunto, numero_doc, numero_doc_hasta, fecha_inicial, 
          fecha_final, caja, upd, tomo, otro, caja_interna, folios, soporte, 
          frecuencia, notas, elaborado_por, fecha_del_dato, nro_acta_transferible, 
          fecha_transferencia
      FROM fuiddatosreal WHERE 1=1`;  // Filtrar por los filtros proporcionados

      // Aplicar filtros si existen
      if (filtros.caja) {
          query += ` AND caja = '${filtros.caja}'`;
      }
      if (filtros.entidad_remitente) {
          query += ` AND entidad_remitente LIKE '%${filtros.entidad_remitente}%'`;
      }

      console.log('Consultando la base de datos con los filtros aplicados...');

      // Ejecutar la consulta SQL
      const [rows] = await db.promise().query(query);

      // Si no se encontraron registros, devolver un error
      if (!rows || rows.length === 0) {
          console.error('No se encontraron datos en la base de datos.');
          return res.status(404).json({ error: 'No se encontraron datos en la base de datos.' });
      }

      console.log(`${rows.length} filas encontradas. Insertando datos en la plantilla...`);
      const worksheet = workbook.getWorksheet(1);
      let startRow = 8;

      // Función para formatear fechas sin hora
      function fecha_del_formato(date) {
        if (!date) return null; // Manejar valores nulos o indefinidos
        const d = new Date(date);
        d.setHours(0, 0, 0, 0); // Establecer la hora a las 00:00:00 para eliminar cualquier hora no deseada
        return d;
      }

      // Insertar los datos en el archivo Excel
      rows.forEach((dato) => {
        const row = worksheet.getRow(startRow++);

        row.getCell(1).value = dato.n_orden;
        row.getCell(2).value = dato.codigo;
        row.getCell(3).value = dato.entidad_remitente;
        row.getCell(4).value = dato.entidad_productora;
        row.getCell(5).value = dato.unidad_administrativa;
        row.getCell(6).value = dato.oficina_productora;
        row.getCell(7).value = dato.objeto;
        row.getCell(8).value = dato.serie;
        row.getCell(9).value = dato.subserie;
        row.getCell(10).value = dato.asunto;
        row.getCell(11).value = dato.numero_doc;
        row.getCell(12).value = dato.numero_doc_hasta;

        // Asignar valores de fecha y asegurarse de que se formateen correctamente
        let fechaInicial = fecha_del_formato(dato.fecha_inicial);
        if (fechaInicial) {
            row.getCell(13).value = fechaInicial;
            row.getCell(13).numFmt = 'DD/MM/YYYY'; // Establecer el formato de la celda como solo fecha
        }

        let fechaFinal = fecha_del_formato(dato.fecha_final);
        if (fechaFinal) {
            row.getCell(14).value = fechaFinal;
            row.getCell(14).numFmt = 'DD/MM/YYYY'; // Establecer el formato de la celda como solo fecha
        }

        let fechaDelDato = fecha_del_formato(dato.fecha_del_dato);
        if (fechaDelDato) {
            row.getCell(25).value = fechaDelDato;
            row.getCell(25).numFmt = 'DD/MM/YYYY'; // Establecer el formato de la celda como solo fecha
        }

        let fechaTransferencia = fecha_del_formato(dato.fecha_transferencia);
        if (fechaTransferencia) {
            row.getCell(27).value = fechaTransferencia;
            row.getCell(27).numFmt = 'DD/MM/YYYY'; // Establecer el formato de la celda como solo fecha
        }

        // Asignar valores de texto o números a las celdas restantes
        row.getCell(15).value = dato.caja;
        row.getCell(16).value = dato.upd;
        row.getCell(17).value = dato.tomo;
        row.getCell(18).value = dato.otro;
        row.getCell(19).value = dato.caja_interna;
        row.getCell(20).value = dato.folios;
        row.getCell(21).value = dato.soporte;
        row.getCell(22).value = dato.frecuencia;
        row.getCell(23).value = dato.notas;
        row.getCell(24).value = dato.elaborado_por;
        row.getCell(26).value = dato.nro_acta_transferible;

        row.commit();
      });

      console.log('Datos insertados. Guardando el archivo...');
      await workbook.xlsx.writeFile(outputPath);

      console.log(`Archivo guardado en: ${outputPath}`);
      res.json({ fileUrl: `/temp/${fileName}.xlsx` });
  } catch (error) {
      console.error('Error al generar la plantilla:', error.message);
      res.status(500).json({ error: 'Error interno del servidor.' });
  }
});



// Endpoint POST para marcar múltiples registros como "OK" en historial_y_cambios
app.post('/fuiddatosreal/marcar-ok', isAuthenticated, (req, res) => {
  const { ids } = req.body;

  const user = req.session.user;
  const { rol, nombre, cc, sede } = user;

  // Validación de permisos
  if (rol !== 'LIDER' && rol !== 'ADMIN' && rol !== 'TECNICA') {
      return res.status(403).json({
          success: false,
          error: 'Acceso denegado. Solo LIDER, ADMIN o TECNICA pueden realizar esta acción.'
      });
  }

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
          success: false,
          error: 'Se requiere un array de IDs válido y no vacío.'
      });
  }

  const cambio_calidad = `${nombre} (${cc})`;
  const sede_calidad = sede;

  db.beginTransaction(err => {
      if (err) {
          console.error('Error al iniciar transacción:', err.message);
          return res.status(500).json({
              success: false,
              error: 'Error al iniciar transacción',
              message: err.message
          });
      }

      const sql = `
          UPDATE fuiddatosreal 
          SET historial_y_cambios = 'OK',
              cambio_calidad = ?,
              sede_calidad = ?
          WHERE id IN (?)
      `;

      db.query(sql, [cambio_calidad, sede_calidad, ids], (err, result) => {
          if (err) {
              console.error('Error al actualizar registros:', err.message);
              db.rollback();
              return res.status(500).json({
                  success: false,
                  error: 'Error al actualizar registros',
                  message: err.message
              });
          }

          if (result.affectedRows !== ids.length) {
              db.rollback();
              return res.status(400).json({
                  success: false,
                  error: 'Algunos IDs no existen o no pudieron actualizarse',
                  affectedRows: result.affectedRows,
                  expected: ids.length
              });
          }

          db.commit(err => {
              if (err) {
                  console.error('Error al confirmar transacción:', err.message);
                  db.rollback();
                  return res.status(500).json({
                      success: false,
                      error: 'Error al confirmar transacción',
                      message: err.message
                  });
              }

              res.status(200).json({
                  success: true,
                  message: `${ids.length} registros actualizados correctamente.`,
                  cambios: 'Se marcó "OK", con cambio_calidad y sede_calidad registrados.'
              });
          });
      });
  });
});

app.get('/api/fuid-con-estado-caja', (req, res) => {
  const query = `
    SELECT 
      f.id, f.fecha_del_dato, f.n_orden, f.codigo, f.entidad_remitente, f.entidad_productora,
      f.unidad_administrativa, f.oficina_productora, f.objeto, f.serie, f.subserie,
      f.numero_de_orden_interno, f.accionado_procesado, f.accionado_denunciante, f.identificacion,
      f.asunto, f.radicado, f.numero_doc, f.numero_doc_hasta, f.fecha_inicial,
      f.fecha_final, f.caja, f.upd, f.tomo, f.otro, f.caja_interna, f.folios,
      f.soporte, f.frecuencia, f.elaborado_por, f.nro_acta_transferible, 
      f.fecha_transferencia, f.notas, f.sede, f.tiempo,
      mc.estado_caja
    FROM fuiddatosreal f
    LEFT JOIN modulos_caja mc ON f.caja = mc.caja_modulo
  `;

  db.query(query, (err, results) => {
    if (err) {
      console.error('Error al ejecutar la consulta combinada:', err);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }

    res.json(results);
  }); 
});






// Rutas para páginas
app.get('/admin', isAuthenticated, isAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'Paginas','Admin.html'));
});

app.get('/TecnicaReal', isAuthenticated, isTecnica, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'Principal_modulo.html'));
});

app.get('/Datos', isAuthenticated, isTecnica, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'Datos.html'));
});

app.get('/Tabla', isAuthenticated, isTecnica, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'Tabla.html'));
});

app.get('/Modulo_Caja', isAuthenticated, isTecnica, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'Modulo_Caja.html'));
});


app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'Paginas',  'Login.html'));
});


app.listen(port, '0.0.0.0', () => {
  console.log(`Servidor ejecutándose en http://200.100.20.66:3000 `);
});

