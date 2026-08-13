// Función para manejar el botón "Insertar Sub-Módulo"
// Asegurarse de que el botón "Insertar Sub-Módulo" abre el modal de formulario
document.getElementById('insertar-modulo-cliente').addEventListener('click', () => {
    document.getElementById('modalFormularioSubModulo').style.display = 'block';
});

// Cerrar el modal de formulario
document.getElementById('cerrarModalFormulario').addEventListener('click', () => {
    document.getElementById('modalFormularioSubModulo').style.display = 'none';
});

// Guardar los datos del formulario y enviarlos al backend
document.getElementById('guardarSubModulo').addEventListener('click', () => {
    const codigo = document.getElementById('codigo').value;
    const entidadRemitente = document.getElementById('entidadRemitente').value;

    if (codigo && entidadRemitente) {
        // Obtener la sede del usuario actual 
        fetch('http://200.100.20.66:3000/currentUser')
            .then(res => {
                if (!res.ok) throw new Error('No se pudo obtener el usuario actual');
                return res.json();
            })
            .then(user => {
                const sedeSubmodulo = user.sede; // sede del usuario logueado

                // Crear un nuevo sub-módulo
                return fetch('http://200.100.20.66:3000/sub_modulos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        codigo, 
                        entidad_remitente: entidadRemitente,
                        sede_submodulos: sedeSubmodulo
                    })
                });
            })
            .then(response => {
                if (response.ok) {
                    alert('Sub-módulo insertado con éxito');
                    document.getElementById('modalFormularioSubModulo').style.display = 'none'; // Cerrar modal
                    cargarModulos(); // Recargar la lista de sub-módulos
                } else {
                    return response.text().then(text => {
                        alert(`Error al insertar sub-módulo: ${text}`);
                    });
                }
            })
            .catch(error => {
                console.error('Error al insertar sub-módulo:', error);
                alert('Error al insertar sub-módulo');
            });
    } else {
        alert('Debe proporcionar todos los datos para insertar un sub-módulo');
    }
});


// Obtener el usuario actual y cargar los módulos
fetch('http://200.100.20.66:3000/currentUser')
    .then(response => response.json())
    .then(user => {
        window.usuarioRol = user.rol;
        window.sede = user.sede; 
        document.getElementById('usuario-nombre').textContent = user.nombre;

        cargarModulos(); // Cargar los módulos

        const tablaBtn = document.getElementById('insertar-modulo-cliente');
        if (window.usuarioRol === 'LIDER' || window.usuarioRol === 'ADMIN') {
            tablaBtn.style.display = 'block';
        } else {
            tablaBtn.style.display = 'none';
        }
    })
    .catch(error => {
        console.error('Error al obtener información del usuario:', error);
        alert('Error al obtener información del usuario');
    });

// Manejar el cierre de sesión
document.getElementById('salir-sesion').addEventListener('click', () => {
    fetch('http://200.100.20.66:3000/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(response => {
        if (response.ok) {
            window.location.href = '/'; // Redirigir al login
        } else {
            console.error('Error al cerrar sesión');
            alert('Error al cerrar sesión');
        }
    })
    .catch(error => {
        console.error('Error al cerrar sesión:', error);
        alert('Error al cerrar sesión');
    });
});

// Buscar y filtrar sub-módulos en tiempo real
document.getElementById('input-buscador').addEventListener('input', (event) => {
    const terminoBusqueda = event.target.value.toLowerCase();

    fetch('http://200.100.20.66:3000/sub_modulos')
        .then(response => response.json())
        .then(subModulos => {
            const contenedorModulos = document.getElementById('contenedor-modulos');
            contenedorModulos.innerHTML = ''; // Limpiar el contenedor

            const subModulosFiltrados = subModulos.filter(subModulo => 
                subModulo.entidad_remitente.toLowerCase().includes(terminoBusqueda) ||
                subModulo.codigo.toLowerCase().includes(terminoBusqueda)
            );

            if (subModulosFiltrados.length > 0 || terminoBusqueda === '') {
                subModulosFiltrados.forEach(subModulo => {
                    const divModulo = document.createElement('div');
                    divModulo.classList.add('modulo');
                    divModulo.innerHTML = `
                        <p>Código: ${subModulo.codigo}</p>
                        <p>Entidad Remitente: ${subModulo.entidad_remitente}</p>
                        ${window.usuarioRol === 'LIDER' || window.usuarioRol === 'ADMIN' ? `
                            <button class="editar-modulo" data-id="${subModulo.id}">Editar</button>
                            <button class="eliminar-modulo" data-id="${subModulo.id}">Eliminar</button>
                            <button class="agregar-tecnica" data-id="${subModulo.id}">Agregar Técnica</button>
                            <button class="agregar-calidad" data-id="${subModulo.id}">Agregar Calidad</button>
                        ` : ''}
                        <button class="ingresar-submodulo" data-id="${subModulo.id}">Ingresar</button>
                    `;
                    contenedorModulos.appendChild(divModulo);
                });

                registrarEventosModulos(); // Registrar eventos para los botones filtrados
            } else {
                contenedorModulos.innerHTML = '<p>No se han encontrado sub-módulos.</p>';
            }
        })
        .catch(error => {
            console.error('Error al buscar sub-módulos:', error);
            alert('Error al buscar sub-módulos.');
        });
});

let modulosCargados = [];
let totalModulos = 0;
let paginaActual = 1;
const modulosPorPagina = 10;

// Función para cargar y mostrar los sub-módulos filtrados por sede
function cargarModulos() {
    // 1. Obtener el usuario actual
    fetch('http://200.100.20.66:3000/currentUser')
        .then(res => {
            if (!res.ok) throw new Error('No autenticado');
            return res.json();
        })
        .then(user => {
            const sedeUsuario = user.sede;

            // 2. Traer todos los sub-módulos
            return fetch('http://200.100.20.66:3000/sub_modulos')
                .then(response => {
                    if (!response.ok) throw new Error('Error al obtener sub-módulos');
                    return response.json();
                })
                .then(subModulos => {
                    // 3. Filtrar por la sede del usuario
                    const subModulosFiltrados = subModulos.filter(
                        sm => sm.sede_submodulos === sedeUsuario
                    );

                    // 4. Guardar y mostrar
                    modulosCargados = subModulosFiltrados;
                    totalModulos = subModulosFiltrados.length;
                    paginaActual = 1;

                    mostrarModulos(modulosCargados); // Mostrar la primera página
                    actualizarPaginacion(); // Actualizar la UI de paginación
                });
        })
        .catch(error => {
            console.error('Error al cargar sub-módulos:', error);
        });
}

// Función para mostrar solo los módulos de la página actual
function mostrarModulos(modulos) {
    const contenedorModulos = document.getElementById('contenedor-modulos');
    contenedorModulos.innerHTML = '';

    const inicio = (paginaActual - 1) * modulosPorPagina;
    const fin = inicio + modulosPorPagina;
    const modulosPagina = modulos.slice(inicio, fin);

    modulosPagina.forEach(subModulo => {
        const divModulo = document.createElement('div');
        divModulo.classList.add('modulo');
        divModulo.innerHTML = `
            <p><strong>Código:</strong> ${subModulo.codigo}</p>
            <p><strong>Entidad Remitente:</strong> ${subModulo.entidad_remitente}</p>
            <p><strong>Sede:</strong> ${subModulo.sede_submodulos}</p>
            ${window.usuarioRol === 'LIDER' || window.usuarioRol === 'ADMIN' ? `
                <button class="editar-modulo" data-id="${subModulo.id}">Editar</button>
                <button class="eliminar-modulo" data-id="${subModulo.id}">Eliminar</button>
                <button class="agregar-tecnica" data-id="${subModulo.id}">Agregar Técnica</button>
                <button class="agregar-calidad" data-id="${subModulo.id}">Agregar Calidad</button>
            ` : ''}
            <button class="ingresar-submodulo" data-id="${subModulo.id}">Ingresar</button>
        `;
        contenedorModulos.appendChild(divModulo);
    });

    registrarEventosModulos();
}


// Función para cambiar de página
window.cambiarPagina = function (direccion) {
    const totalPaginas = Math.ceil(totalModulos / modulosPorPagina);
    if (direccion === 'next' && paginaActual < totalPaginas) {
        paginaActual++;
    } else if (direccion === 'prev' && paginaActual > 1) {
        paginaActual--;
    }
    mostrarModulos(modulosCargados);
    actualizarPaginacion();
};

// Función para actualizar la paginación
function actualizarPaginacion() {
    const totalPaginas = Math.ceil(totalModulos / modulosPorPagina);
    document.getElementById('currentPage').textContent = `Página ${paginaActual} de ${totalPaginas}`;

    document.getElementById('prevPage').classList.toggle('disabled', paginaActual === 1);
    document.getElementById('nextPage').classList.toggle('disabled', paginaActual === totalPaginas);
    document.getElementById('paginaInput').value = paginaActual;
}

window.irAPagina = function () {
    const paginaInput = document.getElementById('paginaInput');
    const paginaDestino = parseInt(paginaInput.value, 10);
    const totalPaginas = Math.ceil(totalModulos / modulosPorPagina);

    if (paginaDestino >= 1 && paginaDestino <= totalPaginas) {
        paginaActual = paginaDestino;
        mostrarModulos(modulosCargados);
        actualizarPaginacion();
        document.getElementById('mensajeErrorPagina').style.display = 'none';
    } else {
        document.getElementById('mensajeErrorPagina').style.display = 'block';
    }
};

// Permitir ir con Enter
const paginaInput = document.getElementById('paginaInput');
paginaInput.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
        irAPagina();
    }
});

// Registrar eventos al cargar el DOM
document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('prevPage').addEventListener('click', () => cambiarPagina('prev'));
    document.getElementById('nextPage').addEventListener('click', () => cambiarPagina('next'));
    document.getElementById('goToPage').addEventListener('click', irAPagina);

    cargarModulos(); // Carga inicial
});


// Función para registrar los eventos de los botones de sub-módulos
function registrarEventosModulos() {
    // Evento para editar sub-módulos
    document.querySelectorAll('.editar-modulo').forEach(btn => {
        btn.addEventListener('click', (event) => {
            const moduloId = event.target.dataset.id;
            const nuevoCodigo = prompt('Ingrese el nuevo código del sub-módulo:');
            const nuevaEntidadRemitente = prompt('Ingrese la nueva entidad remitente:');

            if (nuevoCodigo && nuevaEntidadRemitente) {
                fetch(`http://200.100.20.66:3000/sub_modulos/${moduloId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ codigo: nuevoCodigo, entidad_remitente: nuevaEntidadRemitente })
                })
                .then(response => {
                    if (response.ok) {
                        alert('Sub-módulo actualizado correctamente');
                        cargarModulos(); // Recargar la lista de sub-módulos
                    } else {
                        return response.text().then(text => {
                            alert(`Error al actualizar sub-módulo: ${text}`);
                        });
                    }
                })
                .catch(error => {
                    console.error('Error al actualizar sub-módulo:', error);
                });
            }
        });
    });

    // Evento para eliminar sub-módulos
    document.querySelectorAll('.eliminar-modulo').forEach(btn => {
        btn.addEventListener('click', (event) => {
            const moduloId = event.target.dataset.id;
            if (confirm('¿Estás seguro de que deseas eliminar este sub-módulo?')) {
                fetch(`http://200.100.20.66:3000/sub_modulos/${moduloId}`, {
                    method: 'DELETE'
                })
                .then(response => {
                    if (response.ok) {
                        alert('Sub-módulo eliminado correctamente');
                        cargarModulos(); // Recargar la lista de sub-módulos
                    } else {
                        return response.text().then(text => {
                            alert(`Error al eliminar sub-módulo: ${text}`);
                        });
                    }
                })
                .catch(error => {
                    console.error('Error al eliminar sub-módulo:', error);
                });
            }
        });
    });

    // Evento para agregar usuarios a TECNICA
    document.querySelectorAll('.agregar-tecnica').forEach(btn => {
        btn.addEventListener('click', (event) => {
            const moduloId = event.target.dataset.id; 
            if (!moduloId) {
                console.error('Error: modulo_id no está definido.');
                return;
            }

            document.getElementById('eliminarSeleccionados').dataset.moduloId = moduloId;
            document.getElementById('agregarSeleccionados').dataset.moduloId = moduloId; 
            document.getElementById('agregarSeleccionados').dataset.rol = 'tecnica';
            document.getElementById('eliminarSeleccionados').dataset.rol = 'tecnica';  // Añadido para asegurar que sea TECNICA

            console.log(`Asignando usuarios a TECNICA, moduloId: ${moduloId}, rol: tecnica`);
            cargarUsuariosAsignados(moduloId, 'tecnica'); // Cargar usuarios asignados a TECNICA
        });
    });

    // Evento para agregar usuarios a CALIDAD
    document.querySelectorAll('.agregar-calidad').forEach(btn => {
        btn.addEventListener('click', (event) => {
            const moduloId = event.target.dataset.id; 
            if (!moduloId) {
                console.error('Error: modulo_id no está definido.');
                return;
            }

            document.getElementById('eliminarSeleccionados').dataset.moduloId = moduloId;
            document.getElementById('agregarSeleccionados').dataset.moduloId = moduloId; 
            document.getElementById('agregarSeleccionados').dataset.rol = 'calidad';
            document.getElementById('eliminarSeleccionados').dataset.rol = 'calidad';  // Añadido para asegurar que sea CALIDAD

            console.log(`Asignando usuarios a CALIDAD, moduloId: ${moduloId}, rol: calidad`);
            cargarUsuariosAsignados(moduloId, 'calidad'); // Cargar usuarios asignados a CALIDAD
        });
    });

    // Evento para "Ingresar" a sub-módulo
        document.querySelectorAll('.ingresar-submodulo').forEach(btn => {
            btn.addEventListener('click', (event) => {
                const moduloId = event.target.dataset.id;
                
                // Redirige a la URL con el móduloId en el query
                window.location.href = `TecnicaReal.html?moduloId=${encodeURIComponent(moduloId)}`;
                
                // Limpiar y establecer datos en localStorage
                localStorage.clear();
                
                const codigoRealElement = event.target.parentElement.querySelector('p:nth-child(1)');
                const entidadRealElement = event.target.parentElement.querySelector('p:nth-child(2)');
                
                if (codigoRealElement && entidadRealElement) {
                    const codigorael = codigoRealElement.textContent.split(': ')[1];
                    const entidadreal = entidadRealElement.textContent.split(': ')[1];
                    
                    localStorage.setItem('codigo', codigorael);
                    localStorage.setItem('entidad_remitente', entidadreal);
                } else {
                    console.warn("Los elementos 'codigo' o 'entidad_remitente' no se encontraron en el DOM.");
                }
            });
        });

}

// Función para cargar usuarios asignados a un sub-módulo para TECNICA o CALIDAD
function cargarUsuariosAsignados(moduloId, rol) {
    const tablaAsignacion = rol === 'tecnica' ? 'asignacion_tecnica' : 'asignacion_calidad';

    fetch(`http://200.100.20.66:3000/usuarios/${rol}?sede=${encodeURIComponent(window.sede)}`)
        .then(response => response.json())
        .then(usuarios => {
            const modal = document.getElementById('modalSeleccionUsuario');
            const listaUsuarios = document.getElementById('listaUsuariosTecnica');
            listaUsuarios.innerHTML = '';  // Limpiar la lista de usuarios

            if (usuarios.length > 0) {
                fetch(`http://200.100.20.66:3000/${tablaAsignacion}/${moduloId}/usuarios`)
                    .then(response => response.json())
                    .then(usuariosAsignados => {
                        usuarios.forEach(usuario => {
                            const yaAsignado = usuariosAsignados.some(asignado => asignado.id === usuario.id);
                            
                            const li = document.createElement('li');
                            li.innerHTML = ` 
                                <span>${usuario.nombre} (${usuario.sede})</span>
                                <input type="checkbox" class="usuario-seleccionado" data-id="${usuario.id}" data-asignado="${yaAsignado ? 'true' : 'false'}" ${yaAsignado ? 'checked' : ''}>
                                ${yaAsignado ? '<span class="asignado">(Asignado)</span>' : ''}
                            `;
                            listaUsuarios.appendChild(li);
                        });
                    })
                    .catch(error => {
                        console.error('Error al cargar usuarios asignados:', error);
                    });
            } else {
                listaUsuarios.innerHTML = `<li>No hay usuarios disponibles para el rol ${rol}</li>`;
            }

            modal.style.display = 'block';
        })
        .catch(error => {
            console.error(`Error al cargar usuarios de ${rol}:`, error);
        });
}

// Evento para agregar usuarios seleccionados de un sub-módulo
document.getElementById('agregarSeleccionados').addEventListener('click', () => {
    const seleccionados = document.querySelectorAll('.usuario-seleccionado');
    const moduloId = document.getElementById('agregarSeleccionados').dataset.moduloId;
    const rol = document.getElementById('agregarSeleccionados').dataset.rol;
    const tablaAsignacion = rol === 'tecnica' ? 'asignacion_tecnica' : 'asignacion_calidad';

    if (!moduloId) {
        console.error('Error: modulo_id no está definido');
        return;
    }

    const usuariosParaAgregar = [];

    seleccionados.forEach(checkbox => {
        if (checkbox.checked && checkbox.dataset.asignado === 'false') {
            usuariosParaAgregar.push(checkbox.dataset.id);
        }
    });

    // Asignar usuarios
    if (usuariosParaAgregar.length > 0) {
        fetch(`http://200.100.20.66:3000/${tablaAsignacion}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modulo_id: moduloId, usuarios: usuariosParaAgregar })
        })
        .then(response => response.json())
        .then(data => {
            alert('Usuarios asignados correctamente.');
            document.getElementById('modalSeleccionUsuario').style.display = 'none';
        })
        .catch(error => {
            console.error('Error al asignar usuarios:', error);
            alert('Error al asignar usuarios.');
        });
    }

    document.getElementById('modalSeleccionUsuario').style.display = 'none';
});

// Evento para eliminar usuarios seleccionados de un módulo
document.getElementById('eliminarSeleccionados').addEventListener('click', () => {
    const seleccionados = document.querySelectorAll('.usuario-seleccionado:checked');
    const moduloId = document.getElementById('eliminarSeleccionados').dataset.moduloId;
    const rol = document.getElementById('eliminarSeleccionados').dataset.rol;
    const tablaAsignacion = rol === 'tecnica' ? 'asignacion_tecnica' : 'asignacion_calidad';

    console.log(`Eliminando usuarios de ${rol}, moduloId: ${moduloId}`);

    if (!moduloId) {
        alert('Error: No se ha seleccionado un módulo.');
        return;
    }

    if (seleccionados.length > 0) {
        const idsSeleccionados = Array.from(seleccionados).map(checkbox => checkbox.dataset.id);

        fetch(`http://200.100.20.66:3000/${tablaAsignacion}/${moduloId}/eliminar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ usuarios: idsSeleccionados })
        })
        .then(response => response.json())
        .then(data => {
            alert('Usuarios eliminados correctamente');
            document.getElementById('modalSeleccionUsuario').style.display = 'none';
        })
        .catch(error => {
            console.error('Error al eliminar usuarios del módulo:', error);
            alert('Error al eliminar usuarios del módulo');
        });
    } else {
        alert('No has seleccionado a ningún usuario');
    }
});

// Función para cerrar el modal
function cerrarModal() {
    const modal = document.getElementById('modalSeleccionUsuario');
    modal.style.display = 'none';
}

// Evento para cerrar el modal al hacer clic en el botón de cerrar
document.getElementById('cerrarModal').addEventListener('click', cerrarModal);

// Inicializar la carga de sub-módulos al cargar la página
fetch('http://200.100.20.66:3000/currentUser')
    .then(response => response.json())
    .then(user => {
        window.usuarioRol = user.rol;
        window.sede = user.sede;  // Guardar la sede del líder
        document.getElementById('usuario-nombre').textContent = user.nombre;

        cargarModulos();  // Cargar los módulos
    })
    .catch(error => {
        console.error('Error al obtener información del usuario:', error);
        alert('Error al obtener información del usuario');
    });
