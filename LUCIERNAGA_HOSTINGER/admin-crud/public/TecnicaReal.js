let modulosCargados = []; // Variable global para almacenar los módulos cargados

// Asegurarse de que el botón "Insertar Módulo Cliente" abre el modal de formulario
document.getElementById('insertar-modulo-cliente').addEventListener('click', () => {
    document.getElementById('modalFormularioModulo').style.display = 'block';
    
    // Asignar valores de localStorage a los campos de entrada al abrir el modal
    const codigoStored = localStorage.getItem('codigo');
    const entidadRemitenteStored = localStorage.getItem('entidad_remitente');

    if (codigoStored) {
        document.getElementById('codigo').value = codigoStored;
    }

    if (entidadRemitenteStored) {
        document.getElementById('entidadRemitente').value = entidadRemitenteStored;
    }
});

// Cerrar el modal de formulario
document.getElementById('cerrarModalFormulario').addEventListener('click', () => {
    document.getElementById('modalFormularioModulo').style.display = 'none';
});

// Función para formatear la fecha en formato día-mes-año
function formatearFechaDiaMesAnio(fecha) {
    const fechaObj = new Date(fecha);
    
    if (isNaN(fechaObj.getTime())) {
        console.warn('Fecha inválida:', fecha);
        return 'Fecha no válida'; // Mensaje por defecto si la fecha es inválida
    }

    // Formato día-mes-año
    const dia = String(fechaObj.getDate()).padStart(2, '0');
    const mes = String(fechaObj.getMonth() + 1).padStart(2, '0'); // Mes 0-indexado
    const anio = fechaObj.getFullYear();

    return `${dia}-${mes}-${anio}`;
}

// Guardar los datos del formulario y enviarlos al backend
document.getElementById('guardarModulo').addEventListener('click', () => {
    const codigo = document.getElementById('codigo').value;
    const entidadRemitente = document.getElementById('entidadRemitente').value;
    const actaTransferencia = document.getElementById('actaTransferencia').value;
    const fecha_trans = document.getElementById('fechatrans_modulo').value; // Fecha en formato yyyy-mm-dd
    const urlParams = new URLSearchParams(window.location.search);
    const subModuloId = urlParams.get('moduloId'); // Obtener el moduloId de la URL

    console.log('Fecha ingresada:', fecha_trans); // Depuración: Verificar valor de fecha

    if (codigo && entidadRemitente && actaTransferencia && fecha_trans && subModuloId) {
        // Guardar en localStorage
        localStorage.setItem('fecha_trans_caja', fecha_trans);

        fetch('http://200.100.20.66:3000/moduloscliente', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                codigo: codigo,
                entidad_remitente: entidadRemitente,
                acta_transferencia_modulo: actaTransferencia,
                fecha_trans_modulo: fecha_trans, // Usar la fecha directamente
                id_submodulo: subModuloId,
                id_modulo_caja: subModuloId
            })
        })
        .then(response => {
            if (response.ok) {
                alert('Módulo cliente insertado con éxito');
                document.getElementById('modalFormularioModulo').style.display = 'none'; // Cerrar modal
                cargarModulos(); // Actualizar la lista de módulos
            } else {
                return response.text().then(text => {
                    alert(`Error al insertar módulo cliente: ${text}`);
                });
            }
        })
        .catch(error => {
            console.error('Error al insertar módulo cliente:', error);
            alert('Error al insertar módulo cliente');
        });
    } else {
        alert('Debe proporcionar todos los datos para insertar un módulo');
    }
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

// Función para cargar y mostrar los módulos cliente
function cargarModulos() {
    const urlParams = new URLSearchParams(window.location.search);
    const subModuloId = urlParams.get('moduloId'); // Obtener el moduloId de la URL

    fetch(`http://200.100.20.66:3000/moduloscliente?subModuloId=${subModuloId}`)
        .then(response => response.json())
        .then(modulos => {
            modulosCargados = modulos; // Guardar los módulos cargados en la variable global
            mostrarModulos(modulosCargados); // Mostrar los módulos cargados
        })
        .catch(error => {
            console.error('Error al cargar módulos:', error);
        });
}

// Función para mostrar los módulos en el contenedor
function mostrarModulos(modulos) {
    const contenedorModulos = document.getElementById('contenedor-modulos');
    contenedorModulos.innerHTML = ''; // Limpiar el contenedor

    if (modulos.length === 0) {
        contenedorModulos.innerHTML = '<p>No te han asignado un módulo :( Comunícate con tu Líder.</p>';
    } else {
        modulos.forEach((modulo, index) => {
            const divModulo = document.createElement('div');
            divModulo.classList.add('modulo');
        
            // Establecer la entidad remitente en el título del buscador solo para el primer módulo
            if (index === 0) {
                document.getElementById('entidadRemitenteDisplay').textContent = modulo.entidad_remitente;
            }
            
            divModulo.innerHTML = `
                <div class="conteo-cajas" id="conteo-cajas-${modulo.id}">
                    Cajas totales: Cargando...
                </div>
                <div class="contenido-modulo">
                    <p>Código: ${modulo.codigo}</p>
                    <p>Entidad Remitente: ${modulo.entidad_remitente}</p>
                    <p>Acta Transferencia: ${modulo.acta_transferencia_modulo}</p>
                    <p>Fecha Transferencia: ${formatearFechaDiaMesAnio(modulo.fecha_trans_modulo)}</p> <!-- Mostrar fecha formateada -->
                </div>
                ${['LIDER', 'ADMIN', 'TECNICA'].includes(window.usuarioRol) ? `<button class="ingresar-modulo-caja" data-id="${modulo.id}">Ingresar</button>` : ''}
                ${['LIDER', 'ADMIN'].includes(window.usuarioRol) ? `
                    <button class="editar-modulo" data-id="${modulo.id}">Editar</button>
                    <button class="eliminar-modulo" data-id="${modulo.id}">Eliminar</button>
                    <button class="agregar-tecnica" data-id="${modulo.id}">Agregar Técnica</button>
                    <button class="agregar-calidad" data-id="${modulo.id}">Agregar Calidad</button>` : ''}
                ${window.usuarioRol === 'CALIDAD' ? `<button class="ver-modulo_calidad" data-id="${modulo.id}">Ingresar a Calidad</button>` : ''}
            `;
            contenedorModulos.appendChild(divModulo);
        
            // Solicitud para obtener el conteo de cajas usando el id de moduloscliente
            fetch(`http://200.100.20.66:3000/moduloscliente/count_cajas?modulo_cliente_id=${modulo.id}`)
                .then(response => response.json())
                .then(data => {
                    const conteoElement = document.getElementById(`conteo-cajas-${modulo.id}`);
                    conteoElement.textContent = `Cajas totales: ${data.total}`;
                })
                .catch(error => {
                    console.error('Error al obtener el conteo de cajas:', error);
                    const conteoElement = document.getElementById(`conteo-cajas-${modulo.id}`);
                    conteoElement.textContent = 'Error al cargar el conteo de cajas';
                });
        });

        registrarEventosModulos(); // Registrar eventos para los botones
    }
}



                        // Función para registrar eventos de acción en los módulos
                    function registrarEventosModulos()  {
                        document.querySelectorAll('.editar-modulo').forEach(btn => {
                            btn.addEventListener('click', (event) => {
                                const id = event.target.dataset.id;
                                const codigo = prompt('Ingrese el nuevo código:');
                                const entidadRemitente = prompt('Ingrese la nueva entidad remitente:');
                                const acta_transferencia_modulo = prompt('Ingrese la nueva acta de transferencia:');
                                const fecha_trans = promp ('Ingresa la Fecha de transferencia: ')

                                if (codigo && entidadRemitente && acta_transferencia_modulo && fecha_trans) {
                                    fetch(`http://200.100.20.66:3000/moduloscliente/${id}`, {
                                        method: 'PUT',
                                        headers: {
                                            'Content-Type': 'application/json'
                                        },
                                        body: JSON.stringify({
                                            codigo: codigo,
                                            entidad_remitente: entidadRemitente,
                                            acta_transferencia_modulo: acta_transferencia_modulo,
                                            fecha_trans_modulo : fecha_trans
                                        })
                                    })
                                    .then(response => {
                                        if (response.ok) {
                                            alert('Módulo cliente actualizado');
                                            cargarModulos(); // Actualizar la lista de módulos
                                        } else {
                                            return response.text().then(text => {
                                                alert(`Error al actualizar módulo cliente: ${text}`);
                                            });
                                        }
                                    })
                                    .catch(error => {
                                        console.error('Error al actualizar módulo cliente:', error);
                                        alert('Error al actualizar módulo cliente');
                                    });
                                }
                            });
                        });

                        document.querySelectorAll('.eliminar-modulo').forEach(btn => {
                            btn.addEventListener('click', (event) => {
                                const id = event.target.dataset.id;
                                if (confirm('¿Estás seguro de que deseas eliminar este módulo cliente?')) {
                                    fetch(`http://200.100.20.66:3000/moduloscliente/${id}`, {
                                        method: 'DELETE'
                                    })
                                    .then(response => {
                                        if (response.ok) {
                                            alert('Módulo cliente eliminado');
                                            cargarModulos(); // Actualizar la lista de módulos
                                        } else {
                                            return response.text().then(text => {
                                                alert(`Error al eliminar módulo cliente: ${text}`);
                                            });
                                        }
                                    })
                                    .catch(error => {
                                        console.error('Error al eliminar módulo cliente:', error);
                                        alert('Error al eliminar módulo cliente');
                                    });
                                }
                            });
                        });


// Asegúrate de guardar el 'moduloId_original' al hacer clic en un módulo
document.querySelectorAll('.ingresar-modulo-caja').forEach(btn => {
    btn.addEventListener('click', (event) => {
        const moduloId = event.target.dataset.id; // Obtener el ID del módulo cliente

        // Guardamos 'moduloId_original' en localStorage antes de redirigir
        const currentModuloId = new URLSearchParams(window.location.search).get('moduloId');
        if (currentModuloId) {
            localStorage.setItem('moduloId_original', currentModuloId); // Guardamos el 'moduloId' original
            console.log('moduloId_original guardado:', currentModuloId);
        } else {
            console.warn("No se encontró 'moduloId' en la URL.");
        }

        // Redirigir al módulo Caja con el id correspondiente
        window.location.href = `Modulo_Caja.html?id_modulo_cliente=${moduloId}`;
        
        // Guardamos más datos en localStorage (si es necesario)
        const codigoRealElement = event.target.parentElement.querySelector('p:nth-child(1)');
        const entidadRealElement = event.target.parentElement.querySelector('p:nth-child(2)');
        const actastransElement = event.target.parentElement.querySelector('p:nth-child(3)');
        const fechatransElement = event.target.parentElement.querySelector('p:nth-child(4)');

        if (codigoRealElement && entidadRealElement && actastransElement && fechatransElement) {
            const codigorael = codigoRealElement.textContent.split(': ')[1];
            const entidadreal = entidadRealElement.textContent.split(': ')[1];
            const actastrans = actastransElement.textContent.split(': ')[1];
            const fechatrans = fechatransElement.textContent.split(': ')[1];

            // Guardar los datos adicionales en localStorage (sin limpiar todo el almacenamiento)
            localStorage.setItem('caja_modulo', codigorael);
            localStorage.setItem('entidad_remitente_caja', entidadreal);
            localStorage.setItem('acta_transferencia_caja', actastrans);
            localStorage.setItem('fecha_trans_caja', fechatrans);
        } else {
            console.warn("Los elementos 'codigo', 'entidad_remitente' o 'acta_transferencia' no se encontraron en el DOM.");
        }
    });
});

                        

                        document.querySelectorAll('.ver-modulo_calidad').forEach(btn => {
                            btn.addEventListener('click', (event) => {
                                const moduloClienteId = event.target.dataset.id; // ID del módulo cliente

                                window.location.href = `Modulo_Caja.html?id_modulo_cliente=${moduloClienteId}`;
                            });
                        });

                        // Eventos para agregar usuarios de Técnica y Calidad
                        document.querySelectorAll('.agregar-tecnica, .agregar-calidad').forEach(btn => {
                            btn.addEventListener('click', (event) => {
                                const moduloId = event.target.dataset.id;
                                const rolSeleccionado = btn.classList.contains('agregar-tecnica') ? 'TECNICA' : 'CALIDAD';

                                fetch(`http://200.100.20.66:3000/usuarios/${rolSeleccionado.toLowerCase()}?sede=${encodeURIComponent(window.sede)}`)
                                    .then(response => response.json())
                                    .then(usuarios => {
                                        const modal = document.getElementById('modalSeleccionUsuario');
                                        const listaUsuarios = document.getElementById('listaUsuariosTecnica');
                                        listaUsuarios.innerHTML = ''; // Limpiar la lista de usuarios

                                        if (usuarios.length > 0) {
                                            fetch(`http://200.100.20.66:3000/moduloscliente/${moduloId}/usuarios?rol=${rolSeleccionado.toLowerCase()}`)
                                                .then(response => response.json())
                                                .then(usuariosAsignados => {
                                                    usuarios.forEach(usuario => {
                                                        const yaAsignado = usuariosAsignados.some(asignado => asignado.id === usuario.id);
                                                        const li = document.createElement('li');
                                                        li.innerHTML = `
                                                            <span>
                                                                ${usuario.nombre} (${usuario.sede})
                                                                <input type="checkbox" class="usuario-seleccionado" data-id="${usuario.id}" ${yaAsignado ? 'checked' : ''}>
                                                            </span>
                                                            ${yaAsignado ? '<span class="asignado">(Ya asignado)</span>' : ''}
                                                        `;
                                                        listaUsuarios.appendChild(li);
                                                    });
                                                })
                                                .catch(error => {
                                                    console.error('Error al cargar usuarios asignados:', error);
                                                });
                                        } else {
                                            const li = document.createElement('li');
                                            li.textContent = `No hay usuarios ${rolSeleccionado} en la misma sede.`;
                                            listaUsuarios.appendChild(li);
                                        }

                                        modal.style.display = 'block';
                                        document.getElementById('agregarSeleccionados').dataset.moduloId = moduloId;
                                        document.getElementById('eliminarSeleccionados').dataset.moduloId = moduloId;
                                        document.getElementById('agregarSeleccionados').dataset.rol = rolSeleccionado.toLowerCase();
                                        document.getElementById('eliminarSeleccionados').dataset.rol = rolSeleccionado.toLowerCase();
                                    })
                                    .catch(error => {
                                        console.error('Error al cargar usuarios:', error);
                                    });
                            });
                        });
             }

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

 
    tablaBtn.addEventListener('click', () => {
      
        console.log('Acción de visualización de tabla realizada.');
        
    });
    })
    .catch(error => {
        console.error('Error al obtener información del usuario:', error);
        alert('Error al obtener información del usuario');
    });


    fetch('http://200.100.20.66:3000/currentUser')
    .then(response => response.json())
    .then(user => {
        window.usuarioRol = user.rol;
        window.sede = user.sede; // Guardar la sede del LIDER
        document.getElementById('usuario-nombre').textContent = user.nombre;

        cargarModulos(); // Cargar los módulos

        // Controlar la visibilidad del botón "VER TABLA"
        const tablaBtn = document.getElementById('btn-inventario');
        if (window.usuarioRol === 'LIDER' || window.usuarioRol === 'ADMIN') {
            tablaBtn.style.display = 'block';
        } else {
            tablaBtn.style.display = 'none';
        }

        // Manejar el click en el botón "VER TABLA"
        tablaBtn.addEventListener('click', () => {
            window.location.href = 'Inventario.html'; 
        });
    })
    .catch(error => {
        console.error('Error al obtener información del usuario:', error);
        alert('Error al obtener información del usuario');
    });

    // Obtener el rol del usuario y cargar los módulos
    fetch('http://200.100.20.66:3000/currentUser')
    .then(response => response.json())
    .then(user => {
        window.usuarioRol = user.rol;
        window.sede = user.sede; // Guardar la sede del LIDER
        document.getElementById('usuario-nombre').textContent = user.nombre;

        cargarModulos(); // Cargar los módulos

        // Controlar la visibilidad del botón "VER TABLA"
        const tablaBtn = document.getElementById('tabla-btn');
        if (window.usuarioRol === 'LIDER' || window.usuarioRol === 'ADMIN') {
            tablaBtn.style.display = 'block';
        } else {
            tablaBtn.style.display = 'none';
        }

        // Manejar el click en el botón "VER TABLA"
        tablaBtn.addEventListener('click', () => {
            // Capturar el valor de 'entidad_remitente'
            const primerModulo = document.querySelector('.modulo');
            const entidadRemitente = primerModulo.querySelector('p:nth-child(2)').textContent.split(': ')[1];
            
            // Guardar solo `entidad_remitente` en `localStorage` y el origen como `TecnicaReal`
            localStorage.setItem('filtroTecnicaReal', JSON.stringify({ entidad_remitente: entidadRemitente }));
            localStorage.setItem('origen', 'TecnicaReal');
            
            // Redirigir a `Tabla.html`
            window.location.href = 'Tabla.html';
        });
        
        
    })
    .catch(error => {
        console.error('Error al obtener información del usuario:', error);
        alert('Error al obtener información del usuario');
    });

    // Función para agregar usuarios seleccionados a un módulo
    document.getElementById('agregarSeleccionados').addEventListener('click', () => {
    const seleccionados = document.querySelectorAll('.usuario-seleccionado:checked');
    const moduloId = document.getElementById('agregarSeleccionados').dataset.moduloId;
    const rol = document.getElementById('agregarSeleccionados').dataset.rol;

    if (seleccionados.length > 0) {
        const idsSeleccionados = Array.from(seleccionados).map(checkbox => checkbox.dataset.id);

        // Enviar los IDs seleccionados al servidor para agregarlos al módulo
        fetch(`http://200.100.20.66:3000/moduloscliente/${moduloId}/agregar?rol=${rol}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                usuarios: idsSeleccionados
            })
        })
        .then(response => response.json())
        .then(data => {
            alert('Usuarios agregados correctamente');
            document.getElementById('modalSeleccionUsuario').style.display = 'none';
        })
        .catch(error => {
            console.error('Error al agregar usuarios al módulo:', error);
            alert('Error al agregar usuarios al módulo');
        });
    } else {
        alert('No has seleccionado a ningún usuario');
    }
});

// Manejar el cierre de sesión
document.addEventListener('DOMContentLoaded', () => {
  // Obtener el parámetro moduloId de la URL
  const urlParams = new URLSearchParams(window.location.search);
  const moduloId = urlParams.get('moduloId');

  async function checkAuth() {
    try {
      const response = await fetch('http://200.100.20.66:3000/checkAuth', {
        credentials: 'include'  // Importante para enviar cookies de sesión
      });

      if (response.status === 200) {
        // Sesión válida: continuar con la lógica de la página
        iniciarPagina(moduloId);
      } else {
        // No autenticado, redirigir al login
        window.location.href = '/';
      }
    } catch (error) {
      console.error('Error verificando autenticación:', error);
      window.location.href = '/'; // En caso de error también redirigir
    }
  }

  // Función para iniciar la lógica normal de la página
  function iniciarPagina(moduloId) {
    console.log('Sesión válida. Cargando módulo con ID:', moduloId);
    // Aquí va el resto de tu lógica para cargar datos, etc.
  }

  // Manejar el logout
  const logoutLink = document.getElementById('logout-link');
  if (logoutLink) {
    logoutLink.addEventListener('click', async (event) => {
      event.preventDefault();
      try {
        const response = await fetch('http://200.100.20.66:3000/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include'
        });
        if (response.ok) {
          window.location.href = '/';
        } else {
          alert('Error al cerrar sesión');
        }
      } catch (error) {
        alert('Error al cerrar sesión');
      }
    });
  }

  // Ejecutar validación al cargar la página
  checkAuth();
});


// Función para eliminar usuarios seleccionados de un módulo
document.getElementById('eliminarSeleccionados').addEventListener('click', () => {
    const seleccionados = document.querySelectorAll('.usuario-seleccionado:checked');
    const moduloId = document.getElementById('eliminarSeleccionados').dataset.moduloId;
    const rol = document.getElementById('eliminarSeleccionados').dataset.rol;

    if (seleccionados.length > 0) {
        const idsSeleccionados = Array.from(seleccionados).map(checkbox => checkbox.dataset.id);

        // Enviar los IDs seleccionados al servidor para eliminarlos del módulo
        fetch(`http://200.100.20.66:3000/moduloscliente/${moduloId}/eliminar?rol=${rol}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                usuarios: idsSeleccionados
            })
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

// Obtener el modal y el botón de cierre
const modal = document.getElementById('modalSeleccionUsuario');
const cerrarModalBtn = document.getElementById('cerrarModal');

// Función para cerrar el modal
function cerrarModal() {
    modal.style.display = 'none';
}

// Evento para cerrar el modal al hacer clic en el botón de cerrar
cerrarModalBtn.addEventListener('click', cerrarModal);

// También cerrar el modal si el usuario hace clic fuera del contenido
window.addEventListener('click', function (event) {
    if (event.target === modal) {
        cerrarModal();
    }
});

// Cargar los módulos al cargar la página
window.onload = cargarModulos;
