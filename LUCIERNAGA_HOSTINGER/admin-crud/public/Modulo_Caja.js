let modulosCargados = []; 

  
document.addEventListener('DOMContentLoaded', () => {
        
    
// Capturar el parámetro 'id_modulo_cliente' en Modulo_Caja.html
const urlParams = new URLSearchParams(window.location.search);
const moduloClienteId = urlParams.get('id_modulo_cliente'); // Obtener el parametro id_modulo_cliente de la URL

// 2. Almacenar el id_modulo_cliente en localStorage (si está presente)
if (moduloClienteId) {
    localStorage.setItem('moduloId_cliente', moduloClienteId);  // Guardamos el id_modulo_cliente temporalmente en localStorage
    console.log('id_modulo_cliente guardado:', moduloClienteId);
} else {
    console.warn("No se encontró 'id_modulo_cliente' en la URL.");
}

// 3. Asegurarnos de que el moduloId_original esté en localStorage
const storedModuloIdOriginal = localStorage.getItem('moduloId_original');
if (!storedModuloIdOriginal) {
    console.warn("No se encontró 'moduloId_original' en localStorage.");
}

// 4. Configurar el botón de regreso
const btnRegreso = document.getElementById('btn_regreso');
if (btnRegreso) {
    btnRegreso.addEventListener('click', () => {
        // Redirigir directamente a Principal_modulo.html
        window.location.href = 'http://200.100.20.66:3000/Principal_modulo.html';
    });
} else {
    console.warn("No se encontró el botón 'btn_regreso' en el DOM.");
}

    document.getElementById('insertar-modulo-cliente').addEventListener('click', () => {
        

        // Mostrar el modal
        const modal = document.getElementById('modalFormularioCaja');
        modal.style.display = 'block';
    
        // Restablecer los contenedores de usuarios a "none" (ocultos)
        const contenedorUsuariosTecnica = document.getElementById('usuarios-tecnica');
        const contenedorUsuariosCalidad = document.getElementById('usuarios-calidad');
        
        // Asegurarse de que los contenedores estén ocultos al abrir el modal
        contenedorUsuariosTecnica.style.display = 'none';
        contenedorUsuariosCalidad.style.display = 'none';
    
        // Asignar valores de localStorage a los campos de entrada si están disponibles
        const codigoCaja = localStorage.getItem('caja_modulo');
        const entidadRemitenteCaja = localStorage.getItem('entidad_remitente_caja');
        const actaTransCaja = localStorage.getItem('acta_transferencia_caja');
        const fechaTransCaja = localStorage.getItem('fecha_trans_caja');
    
        // Imprimir valores en consola para depuración
        console.log('codigoCaja:', codigoCaja);
        console.log('entidadRemitenteCaja:', entidadRemitenteCaja);
        console.log('actaTransCaja:', actaTransCaja);
        console.log('fechaTransCaja:', fechaTransCaja);
    
        if (codigoCaja && document.getElementById('prefijo')) {
            document.getElementById('prefijo').value = `${codigoCaja}C`; // Asignar el código con "C" al final en el campo prefijo
        }
        if (entidadRemitenteCaja && document.getElementById('entidadRemitenteCaja')) {
            document.getElementById('entidadRemitenteCaja').value = entidadRemitenteCaja;
        }
        if (actaTransCaja && document.getElementById('actaTransCaja')) {
            document.getElementById('actaTransCaja').value = actaTransCaja;
        }
        if (fechaTransCaja && document.getElementById('fechaTransCaja')) {
            const fechaFormateada = formatearFecha(fechaTransCaja);
            if (fechaFormateada) {
                document.getElementById('fechaTransCaja').value = fechaFormateada; // Asignar la fecha formateada
            } else {
                console.warn('Formato de fecha inválido en localStorage: ', fechaTransCaja);
            }
        }
    
        // Cerrar el modal cuando se presiona el botón de cerrar
        document.getElementById('cerrarModalFormulario').addEventListener('click', () => {
            modal.style.display = 'none';
        });
    
        // Llenar el contenedor de usuarios de Técnica con checkboxes
        fetch(`http://200.100.20.66:3000/usuarios/tecnica?sede=${encodeURIComponent(window.sede)}`)
            .then(response => response.json())
            .then(usuarios => {
                contenedorUsuariosTecnica.innerHTML = ''; // Limpiar el contenedor
    
                if (usuarios && usuarios.length > 0) {
                    usuarios.forEach(usuario => {
                        const label = document.createElement('label');
                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.className = 'usuario-seleccionado';
                        checkbox.dataset.id = usuario.id;
                        label.appendChild(checkbox);
                        label.appendChild(document.createTextNode(usuario.nombre));
    
                        contenedorUsuariosTecnica.appendChild(label);
                        contenedorUsuariosTecnica.appendChild(document.createElement('br'));
                    });
                } else {
                    const mensaje = document.createElement('p');
                    mensaje.textContent = 'No hay usuarios disponibles';
                    contenedorUsuariosTecnica.appendChild(mensaje);
                }
            })
            .catch(error => {
                console.error('Error al cargar los usuarios de Técnica:', error);
                const mensaje = document.createElement('p');
                mensaje.textContent = 'Error al cargar usuarios de Técnica';
                contenedorUsuariosTecnica.appendChild(mensaje);
            });
    
        // Llenar el contenedor de usuarios de Calidad con checkboxes
        fetch(`http://200.100.20.66:3000/usuarios/calidad?sede=${encodeURIComponent(window.sede)}`)
            .then(response => response.json())
            .then(usuarios => {
                contenedorUsuariosCalidad.innerHTML = ''; // Limpiar el contenedor
    
                if (usuarios && usuarios.length > 0) {
                    usuarios.forEach(usuario => {
                        const label = document.createElement('label');
                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.className = 'usuario-seleccionado';
                        checkbox.dataset.id = usuario.id;
                        label.appendChild(checkbox);
                        label.appendChild(document.createTextNode(usuario.nombre));
    
                        contenedorUsuariosCalidad.appendChild(label);
                        contenedorUsuariosCalidad.appendChild(document.createElement('br'));
                    });
                } else {
                    const mensaje = document.createElement('p');
                    mensaje.textContent = 'No hay usuarios disponibles';
                    contenedorUsuariosCalidad.appendChild(mensaje);
                }
            })
            .catch(error => {
                console.error('Error al cargar los usuarios de Calidad:', error);
                const mensaje = document.createElement('p');
                mensaje.textContent = 'Error al cargar usuarios de Calidad';
                contenedorUsuariosCalidad.appendChild(mensaje);
            });
    
        // Asegurarse de que los eventos solo se registren una vez para los botones
        const botonTecnica = document.getElementById('boton-tecnica');
        const botonCalidad = document.getElementById('boton-calidad');
    
        // Evento para mostrar los checkboxes de Técnica
        botonTecnica.removeEventListener('click', toggleTecnica); // Asegurarse de eliminar cualquier evento anterior
        botonTecnica.addEventListener('click', () => {
            contenedorUsuariosTecnica.style.display =
                contenedorUsuariosTecnica.style.display === 'none' ? 'block' : 'none';
        });
    
        // Evento para mostrar los checkboxes de Calidad
        botonCalidad.removeEventListener('click', toggleCalidad); // Asegurarse de eliminar cualquier evento anterior
        botonCalidad.addEventListener('click', () => {
            contenedorUsuariosCalidad.style.display =
                contenedorUsuariosCalidad.style.display === 'none' ? 'block' : 'none';
        });
    });
    
    // Función para formatear la fecha de '19-11-2029' a '2029-11-19'
    function formatearFecha(fecha) {
        // Verificar si la fecha está en el formato 'dd-mm-yyyy'
        const partesFecha = fecha.split('-');
        if (partesFecha.length === 3) {
            const dia = partesFecha[0];
            const mes = partesFecha[1];
            const anio = partesFecha[2];
            
            // Asegurarse de que el formato sea correcto
            if (dia && mes && anio) {
                // Crear una nueva fecha en el formato 'yyyy-mm-dd'
                return `${anio}-${mes}-${dia}`;
            }
        }
        
        // Si el formato no es válido, devolver null
        console.warn('Formato de fecha inválido:', fecha);
        return null;
    }
    
    
    
    
                                                            // Función para alternar visibilidad de los checkboxes de Técnica
                                                            function toggleTecnica() {
                                                                const contenedor = document.getElementById('usuarios-tecnica');
                                                                if (contenedor.style.display === 'none') {
                                                                    contenedor.style.display = 'block';
                                                                } else {
                                                                    contenedor.style.display = 'none';
                                                                }
                                                            }
                                                            
                                                            // Función para alternar visibilidad de los checkboxes de Calidad
                                                            function toggleCalidad() {
                                                                const contenedor = document.getElementById('usuarios-calidad');
                                                                if (contenedor.style.display === 'none') {
                                                                    contenedor.style.display = 'block';
                                                                } else {
                                                                    contenedor.style.display = 'none';
                                                                }
                                                            }
    
    
    // Guardar los datos del formulario y enviarlos al backend
    document.getElementById('guardarModuloCaja').addEventListener('click', () => {
        const prefijo = document.getElementById('prefijo').value;
        const numeroDesde = parseInt(document.getElementById('numeroDesde').value, 10);
        const numeroHasta = parseInt(document.getElementById('numeroHasta').value, 10);
    
        const prefijoRegex = /^[a-zA-Z0-9]+C$/;
        if (!prefijoRegex.test(prefijo) || isNaN(numeroDesde) || isNaN(numeroHasta) || numeroDesde < 0 || numeroHasta < numeroDesde || numeroDesde > 999999 || numeroHasta > 999999) {
            alert('Por favor, ingrese un prefijo válido con "C" y un rango numérico de 6 dígitos.');
            return;
        }
    
        const cantidadCajas = numeroHasta - numeroDesde + 1;
    
        if (prefijo && cantidadCajas > 0) {
            const seleccionadosTecnica = document.querySelectorAll('.usuario-seleccionado:checked');
            const seleccionadosCalidad = document.querySelectorAll('#usuarios-calidad .usuario-seleccionado:checked');
    
            if (seleccionadosTecnica.length === 0 && seleccionadosCalidad.length === 0) {
                alert('Debe seleccionar al menos un usuario para asignar a las cajas.');
                return;
            }
    
            const idsTecnica = Array.from(seleccionadosTecnica).map(checkbox => checkbox.dataset.id);
            const idsCalidad = Array.from(seleccionadosCalidad).map(checkbox => checkbox.dataset.id);
    
            // Función para obtener el valor del campo o "N/A" si está vacío
            const obtenerValorCampo = (campoId) => {
                const valor = document.getElementById(campoId).value;
                return valor.trim() !== '' ? valor : 'N/A';
            };
    
            const entidadRemitenteCaja = obtenerValorCampo('entidadRemitenteCaja');
            const actaTransCaja = obtenerValorCampo('actaTransCaja');
            const fechaTransCaja = obtenerValorCampo('fechaTransCaja');
            const entidadProductoraCaja = obtenerValorCampo('entidadProductoraCaja');
            const unidadAdministrativaCaja = obtenerValorCampo('unidadAdministrativaCaja');
            const oficinaProductoraCaja = obtenerValorCampo('oficinaProductoraCaja');
            const objetoCaja = obtenerValorCampo('objetoCaja');
            const estadoCaja = obtenerValorCampo('estadocaja');
            const idModuloCliente = new URLSearchParams(window.location.search).get('id_modulo_cliente');
    
            if (!idModuloCliente) {
                alert('No se encontró el id del módulo de cliente en la URL.');
                return;
            }
    
            console.log('ID del módulo cliente:', idModuloCliente); // Verificar el ID en la consola
    
            for (let i = 0; i < cantidadCajas; i++) {
                const numeroConsecutivo = String(numeroDesde + i).padStart(6, '0');
                const nuevoCodigo = `${prefijo.split('C')[0]}C${numeroConsecutivo}`;
    
                const requestData = {
                    caja_modulo: nuevoCodigo,
                    entidad_remitente_caja: entidadRemitenteCaja,
                    acta_trans_caja: actaTransCaja,
                    fecha_trans_caja: fechaTransCaja,
                    id_modulo_caja: idModuloCliente,
                    entidad_productora_caja: entidadProductoraCaja,
                    unidad_administrativa_caja: unidadAdministrativaCaja,
                    oficina_productora_caja: oficinaProductoraCaja,
                    objeto_caja: objetoCaja,
                    estado_caja: estadoCaja
                };
    
                console.log('Datos enviados:', requestData);
    
                fetch('http://200.100.20.66:3000/modulos_caja', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestData)
                })
                .then(response => {
                    if (!response.ok) {
                        return response.text().then(text => { throw new Error(text); });
                    }
                    return response.json();
                })
                .then(data => {
                    if (data.modulo && data.modulo.id) {
                        const moduloId = data.modulo.id;
    
                        // Asignar usuarios de Técnica
                        if (idsTecnica.length > 0) {
                            fetch('http://200.100.20.66:3000/asignacion_caja_tecnica', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    modulo_id: moduloId,
                                    usuarios: idsTecnica
                                })
                            })
                            .then(response => response.json())
                            .then(() => console.log(`Usuarios Técnica asignados correctamente a la caja ${nuevoCodigo}`))
                            .catch(error => console.error(`Error al asignar usuarios de Técnica a la caja ${nuevoCodigo}:`, error));
                        }
    
                        // Asignar usuarios de Calidad
                        if (idsCalidad.length > 0) {
                            fetch('http://200.100.20.66:3000/asignacion_caja_calidad', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    modulo_id: moduloId,
                                    usuarios: idsCalidad
                                })
                            })
                            .then(response => response.json())
                            .then(() => console.log(`Usuarios Calidad asignados correctamente a la caja ${nuevoCodigo}`))
                            .catch(error => console.error(`Error al asignar usuarios de Calidad a la caja ${nuevoCodigo}:`, error));
                        }
                    } else {
                        console.error('No se ha obtenido el id del módulo de la caja.');
                    }
                })
                .catch(error => {
                    console.error(`Error al crear caja ${nuevoCodigo}:`, error);
                });
            }
    
            alert(`Creadas ${cantidadCajas} cajas con éxito y asignados los usuarios.`);
            document.getElementById('modalFormularioCaja').style.display = 'none';
        } else {
            alert('Debe proporcionar todos los datos para insertar un módulo de caja');
        }
    });
    

    

                fetch('http://200.100.20.66:3000/currentUser')
                .then(response => response.json())
                .then(user => {
                    window.usuarioRol = user.rol;
                    window.sede = user.sede; // Guardar la sede del LIDER
                    document.getElementById('usuario-nombre').textContent = user.nombre;

                    cargarModulos(); // Cargar los módulos

                    // Controlar la visibilidad del botón "VER TABLA"
                    const tablaBtn = document.getElementById('insertar-modulo-cliente');
                    if (window.usuarioRol === 'LIDER' || window.usuarioRol === 'ADMIN') {
                        tablaBtn.style.display = 'block';
                    } else {
                        tablaBtn.style.display = 'none';
                    }

                    
                    tablaBtn.addEventListener('click', () => {
                        // En lugar de redirigir, realiza alguna otra acción aquí
                        console.log('Acción de visualización de tabla realizada.');
                        // Aquí puedes agregar la lógica que prefieras para mostrar contenido o interactuar con el usuario sin redirigir
                    });
                })
                .catch(error => {
                    console.error('Error al obtener información del usuario:', error);
                    alert('Error al obtener información del usuario');
                });
                          
let modulosPorPagina = 10;  
let paginaActual = 1;  
let totalModulos = 0;  
let modulosCargados = [];  

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

// Función para cargar y mostrar los módulos de caja
function cargarModulos() {
    // Obtener el id_modulo_cliente de la URL
    const urlParams = new URLSearchParams(window.location.search);
    const idModuloCliente = urlParams.get('id_modulo_cliente');  // Usar id_modulo_cliente desde la URL

    // Verificar que tenemos un id de modulo cliente
    if (!idModuloCliente) {
        alert('No se proporcionó un id válido para el módulo cliente');
        return;
    }

    // Filtrar los módulos de caja por el id_modulo_cliente
    fetch(`http://200.100.20.66:3000/modulos_caja?id_modulo_caja=${idModuloCliente}`)  // Ajustamos para usar id_modulo_caja
        .then(response => response.json())
        .then(modulos => {
            modulosCargados = modulos;
            totalModulos = modulos.length; // Total de módulos
            mostrarModulos(modulosCargados); // Mostrar los módulos cargados
            actualizarPaginacion();  // Actualizar la paginación
        })
        .catch(error => {
            console.error('Error al cargar módulos de caja:', error);
            alert('Error al cargar módulos de caja');
        });
}

// Función para mostrar los módulos y sus botones
function mostrarModulos(modulos) {
    const contenedorModulos = document.getElementById('contenedor-modulos');
    contenedorModulos.innerHTML = ''; 

    let enProcesoCount = 0;
    let finalizadoCount = 0;
    let totalRegistros = 0; // Variable para el total de registros

    if (modulos.length === 0) {
        contenedorModulos.innerHTML = '<p>No te han asignado una caja :( Comunícate con tu Líder.</p>';
    } else {
        // Calcular los módulos que deben ser mostrados para la página actual
        const inicio = (paginaActual - 1) * modulosPorPagina;
        const fin = inicio + modulosPorPagina;
        const modulosPagina = modulos.slice(inicio, fin);

        // Ordenar los módulos de mayor a menor por la parte después de "C" en caja_modulo
        modulosPagina.sort((a, b) => {
            const valorA = parseInt(a.caja_modulo.split("C")[1], 10);
            const valorB = parseInt(b.caja_modulo.split("C")[1], 10);
            return valorB - valorA;
        });

        modulosPagina.forEach(modulo => {
            const divModulo = document.createElement('div');
            divModulo.classList.add('modulo'); 

            // Actualizar el contador de estados
            if (modulo.estado_caja === "EN PROCESO") {
                enProcesoCount++;
            } else if (modulo.estado_caja === "FINALIZADO") {
                finalizadoCount++;
            }

            // Establecer la entidad remitente en el título del buscador
            document.querySelector('#buscador .TITULO').innerHTML = `CAJAS DE: ${modulo.entidad_remitente_caja}`;

            divModulo.innerHTML = `
    <div class="registro-conteo" id="conteo-${modulo.caja_modulo}">
        Registros totales: Cargando...
    </div>
    <div class="contenido-modulo">
        <p class="caja-modulo">CAJA: ${modulo.caja_modulo}</p>
        <p class="estado-caja">ESTADO: <span class="${modulo.estado_caja === 'FINALIZADO' ? 'finalizado' : ''}">${modulo.estado_caja}</span></p>
        <p class="persona-tecnica">Persona asignada Técnica: Cargando...</p>
        <p class="persona-calidad">Persona asignada Calidad: Cargando...</p>
        
        <div class="detalles-adicionales" style="display: none;">
            <p class="entidad-remitente">ENTIDAD REMITENTE: ${modulo.entidad_remitente_caja}</p>
            <p class="entidad-productora">ENTIDAD PRODUCTORA: ${modulo.entidad_productora_caja}</p>
            <p class="unidad-administrativa">UNIDAD ADMINISTRATIVA: ${modulo.unidad_administrativa_caja}</p>
            <p class="oficina-productora">OFICINA PRODUCTORA: ${modulo.oficina_productora_caja}</p>                           
            <p class="acta-transferencia">ACTA DE TRANSFERENCIA: ${modulo.acta_trans_caja}</p>
            <p class="fecha-transferencia">FECHA DE TRANSFERENCIA: 
                <input type="text" value="${modulo.fecha_trans_caja.split('T')[0]}" readonly style="border:none; background-color: transparent; width: auto;"/>
            </p> 
            <p class="objeto">OBJETO: ${modulo.objeto_caja}</p>
        </div>
        <button class="toggle-detalles">Mostrar detalles</button>
    </div>
    ${window.usuarioRol === 'LIDER' || window.usuarioRol === 'ADMIN' ? `
        <button class="editar-modulo" data-id="${modulo.id}">Editar</button>
        <button class="eliminar-modulo" data-id="${modulo.id}">Eliminar</button>
        <button class="agregar-tecnica" data-id="${modulo.id}">Agregar Técnica</button>
        <button class="agregar-calidad" data-id="${modulo.id}">Agregar Calidad</button>` : '' }
    ${window.usuarioRol === 'TECNICA' ? `<button class="ingresar" data-id="${modulo.id}">Ingresar</button>` : '' }
    ${window.usuarioRol === 'TECNICA' ? `<button class="cambiarestado" data-id="${modulo.id}">Cambiar Estado</button>` : '' }
    ${['LIDER', 'ADMIN', 'CALIDAD'].includes(window.usuarioRol) ? `<button class="ver" data-id="${modulo.id}">Ver</button>` : '' }
`;

// Fetch para obtener los usuarios asignados en Técnica
fetch(`http://200.100.20.66:3000/modulos_caja/${modulo.id}/usuarios`)
    .then(response => response.json())
    .then(usuariosAsignadosTecnica => {
        const usuarioTecnica = usuariosAsignadosTecnica.length > 0 ? usuariosAsignadosTecnica[0].nombre : 'No asignado';
        divModulo.querySelector('.persona-tecnica').textContent = `Persona asignada Técnica: ${usuarioTecnica}`;
    })
    .catch(error => {
        console.error('Error al cargar usuarios asignados en Técnica:', error);
        divModulo.querySelector('.persona-tecnica').textContent = 'Error al cargar asignación';
    });

// Fetch para obtener los usuarios asignados en Calidad
fetch(`http://200.100.20.66:3000/modulos_caja_calidad/${modulo.id}/usuarios`)
    .then(response => response.json())
    .then(usuariosAsignadosCalidad => {
        const usuarioCalidad = usuariosAsignadosCalidad.length > 0 ? usuariosAsignadosCalidad[0].nombre : 'No asignado';
        divModulo.querySelector('.persona-calidad').textContent = `Persona asignada Calidad: ${usuarioCalidad}`;
    })
    .catch(error => {
        console.error('Error al cargar usuarios asignados en Calidad:', error);
        divModulo.querySelector('.persona-calidad').textContent = 'Error al cargar asignación';
    });


            contenedorModulos.appendChild(divModulo);

           
            divModulo.querySelector('.toggle-detalles').addEventListener('click', function() {
                const detallesAdicionales = divModulo.querySelector('.detalles-adicionales');
                if (detallesAdicionales.style.display === 'none') {
                    detallesAdicionales.style.display = 'block';
                    this.textContent = 'Ocultar detalles';
                } else {
                    detallesAdicionales.style.display = 'none';
                    this.textContent = 'Mostrar detalles';
                }
            });

            // Evento para el botón Cambiar Estado
            const cambiarEstadoBtn = divModulo.querySelector('.cambiarestado');
            if (cambiarEstadoBtn) {
                cambiarEstadoBtn.addEventListener('click', () => {
                    confirmarCambioEstado(modulo);
                });
            }

            
            fetch(`http://200.100.20.66:3000/modulos_caja/count_fuiddatosreal?caja_modulo=${modulo.caja_modulo}`)
                .then(response => response.json())
                .then(data => {
                    const conteoElement = document.getElementById(`conteo-${modulo.caja_modulo}`);
                    conteoElement.textContent = `Registros totales: ${data.total}`;
                    totalRegistros += data.total; 
                    actualizarNumeroEstado(enProcesoCount, finalizadoCount, totalRegistros); 
                })
                .catch(error => {
                    console.error('Error al obtener el conteo de registros:', error);
                    const conteoElement = document.getElementById(`conteo-${modulo.caja_modulo}`);
                    conteoElement.textContent = 'Error al cargar el conteo';
                });
        });

       
        registrarEventosModulos();
    }
}


function actualizarNumeroEstado(enProcesoCount, finalizadoCount, totalRegistros) {
    document.getElementById('numeroestado').textContent = 
        `En Proceso: ${enProcesoCount} / Finalizado: ${finalizadoCount} / Registros totales: ${totalRegistros}`;
}


// Función para confirmar y cambiar el estado de la caja
function confirmarCambioEstado(modulo) {
    // Establecer el nuevo estado (puedes cambiarlo dinámicamente si es necesario)
    const nuevoEstado = modulo.estado_caja === 'FINALIZADO' ? 'EN PROCESO' : 'FINALIZADO'; // Cambiar entre 'FINALIZADO' y 'EN PROCESO'

    // Confirmar con el usuario antes de realizar el cambio
    if (confirm(`¿Estás seguro de cambiar el estado de la caja ${modulo.caja_modulo} a ${nuevoEstado}?`)) {
        // Realizar la solicitud PATCH al backend
        fetch(`http://200.100.20.66:3000/modulos_caja/${modulo.id}/cambiarEstado`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                estado_caja: nuevoEstado  // Enviar el nuevo estado al servidor
            })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Hubo un error al cambiar el estado');
            }
            return response.json();
        })
        .then(data => {
            // Revisamos si el servidor devuelve un mensaje exitoso
            if (data.message && data.message.includes('Estado cambiado')) {
                alert(data.message);  // Mostrar el mensaje de éxito
                
                // Obtener nuevamente los módulos o recargar la vista
                fetchModulos();  // Suponiendo que tienes una función fetchModulos para obtener los módulos
            }
        })
        .catch(error => {
            // Aquí no hacemos nada ni mostramos el mensaje de error
            // Puedes agregar una acción alternativa si lo deseas (ej. un log de consola si es necesario)
            console.error('Hubo un error al cambiar el estado:', error);
        });
    }
}

// Función para obtener nuevamente los módulos después de cambiar el estado
// Función para obtener nuevamente los módulos después de cambiar el estado
function fetchModulos() {
    fetch('http://200.100.20.66:3000/modulos_caja')
        .then(response => response.json())
        .then(data => {
            // Asegúrate de pasar los datos a la función mostrarModulos para actualizar la UI
            mostrarModulos(data.modulos);
        })
        .catch(error => {
            console.error('Error al cargar los módulos:', error);
            // Ya no mostramos un mensaje de alerta, solo dejamos el log en la consola
        });
}




// Función para cambiar de página
function cambiarPagina(direccion) {
    const totalPaginas = Math.ceil(totalModulos / modulosPorPagina);

    if (direccion === 'next' && paginaActual < totalPaginas) {
        paginaActual++;
    } else if (direccion === 'prev' && paginaActual > 1) {
        paginaActual--;
    }

    mostrarModulos(modulosCargados);  // Mostrar los módulos para la página actual
    actualizarPaginacion();  // Actualizar la paginación
}

// Función para actualizar los controles de la paginación
function actualizarPaginacion() {
    const totalPaginas = Math.ceil(totalModulos / modulosPorPagina);
    document.getElementById('currentPage').textContent = `Página ${paginaActual} de ${totalPaginas}`;

    // Deshabilitar los botones de paginación si es necesario
    document.getElementById('prevPage').classList.toggle('disabled', paginaActual === 1);
    document.getElementById('nextPage').classList.toggle('disabled', paginaActual === totalPaginas);

    // Permitir la entrada directa de página
    const paginaInput = document.getElementById('paginaInput');
    paginaInput.value = paginaActual;
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


// Registrar eventos de los botones de paginación
document.addEventListener('DOMContentLoaded', function() {
    const prevPageBtn = document.getElementById('prevPage');
    const nextPageBtn = document.getElementById('nextPage');
    const paginaInput = document.getElementById('paginaInput');

    if (prevPageBtn && nextPageBtn && paginaInput) {
        prevPageBtn.addEventListener('click', () => cambiarPagina('prev'));
        nextPageBtn.addEventListener('click', () => cambiarPagina('next'));
        paginaInput.addEventListener('blur', irAPagina);  // Permitir ingresar número de página
    }
});


// Función para cambiar de página
window.cambiarPagina = function (direccion) {
    const totalPaginas = Math.ceil(totalModulos / modulosPorPagina);

    if (direccion === 'next' && paginaActual < totalPaginas) {
        paginaActual++;
    } else if (direccion === 'prev' && paginaActual > 1) {
        paginaActual--;
    }

    mostrarModulos(modulosCargados);  // Mostrar los módulos para la página actual
    actualizarPaginacion();  // Actualizar la paginación
};

// Función para ir a una página específica
window.irAPagina = function () {
    const paginaInput = document.getElementById('paginaInput');
    const paginaDestino = parseInt(paginaInput.value, 10);
    const totalPaginas = Math.ceil(totalModulos / modulosPorPagina);

    if (paginaDestino >= 1 && paginaDestino <= totalPaginas) {
        paginaActual = paginaDestino;
        mostrarModulos(modulosCargados);  // Mostrar los módulos para la página seleccionada
        actualizarPaginacion();  // Actualizar la paginación
    } else {
        alert('Número de página no válido');
    }
};



// Llamar a cargarModulos al inicio
cargarModulos();



                                                                                                

  // Función para buscar módulos en tiempo real usando la variable global `modulosCargados`
     document.getElementById('input-buscador').addEventListener('input', (event) => {
         const terminoBusqueda = event.target.value.toLowerCase();
         // Filtrar los módulos cargados según el término de búsqueda
         const modulosFiltrados = modulosCargados.filter(modulo =>
             (modulo.caja_modulo && modulo.caja_modulo.toLowerCase().includes(terminoBusqueda)) ||
             (modulo.entidad_remitente_caja && modulo.entidad_remitente_caja.toLowerCase().includes(terminoBusqueda)) ||
             (modulo.acta_trans_caja && modulo.acta_trans_caja.toLowerCase().includes(terminoBusqueda)) ||
             (modulo.fecha_trans_caja && modulo.fecha_trans_caja.toLowerCase().includes(terminoBusqueda))
         );
         mostrarModulos(modulosFiltrados); // Mostrar los módulos filtrados
     });

                                        function registrarEventosModulos() {
                                            document.querySelectorAll('.editar-modulo').forEach(btn => {
                                                btn.addEventListener('click', (event) => {
                                                    const id = event.target.dataset.id;
                                                    document.getElementById('modalEditarModuloCaja').style.display = 'block';
                                                    const cajaModulo = event.target.dataset.cajaModulo || '';
                                                    const entidadRemitenteCaja = event.target.dataset.entidadRemitenteCaja || '';
                                                    const actaTransCaja = event.target.dataset.actaTransCaja || '';
                                                    const fechaTransCaja = event.target.dataset.fechaTransCaja || '';
                                                    const entidadProductoraCaja = event.target.dataset.entidadProductoraCaja || '';
                                                    const unidadAdministrativaCaja = event.target.dataset.unidadAdministrativaCaja || '';
                                                    const oficinaProductoraCaja = event.target.dataset.oficinaProductoraCaja || '';
                                                    const objetoCaja = event.target.dataset.objetoCaja || '';
                                                    document.getElementById('editarCajaModulo').value = cajaModulo;
                                                    document.getElementById('editarEntidadRemitenteCaja').value = entidadRemitenteCaja;
                                                    document.getElementById('editarActaTransCaja').value = actaTransCaja;
                                                    document.getElementById('editarFechaTransCaja').value = fechaTransCaja;
                                                    document.getElementById('editarEntidadProductoraCaja').value = entidadProductoraCaja;
                                                    document.getElementById('editarUnidadAdministrativaCaja').value = unidadAdministrativaCaja;
                                                    document.getElementById('editarOficinaProductoraCaja').value = oficinaProductoraCaja;
                                                    document.getElementById('editarObjetoCaja').value = objetoCaja;
                                                        document.getElementById('guardarEdicionModuloCaja').onclick = function () {
                                                        const nuevoCajaModulo = document.getElementById('editarCajaModulo').value;
                                                        const nuevoEntidadRemitenteCaja = document.getElementById('editarEntidadRemitenteCaja').value;
                                                        const nuevoActaTransCaja = document.getElementById('editarActaTransCaja').value;
                                                        const nuevoFechaTransCaja = document.getElementById('editarFechaTransCaja').value;
                                                        const nuevoEntidadProductoraCaja = document.getElementById('editarEntidadProductoraCaja').value;
                                                        const nuevoUnidadAdministrativaCaja = document.getElementById('editarUnidadAdministrativaCaja').value;
                                                        const nuevoOficinaProductoraCaja = document.getElementById('editarOficinaProductoraCaja').value;
                                                        const nuevoObjetoCaja = document.getElementById('editarObjetoCaja').value;
                                                        const nuevoestadocaja = document.getElementById('editarestadoCaja').value;
                                        
                                                        if (nuevoCajaModulo && nuevoEntidadRemitenteCaja && nuevoActaTransCaja && nuevoFechaTransCaja &&
                                                            nuevoEntidadProductoraCaja && nuevoUnidadAdministrativaCaja && nuevoOficinaProductoraCaja && nuevoObjetoCaja && nuevoestadocaja) {
                                                            
                                                            fetch(`http://200.100.20.66:3000/modulos_caja/${id}`, {
                                                                method: 'PUT',
                                                                headers: {
                                                                    'Content-Type': 'application/json'
                                                                },
                                                                body: JSON.stringify({
                                                                    caja_modulo: nuevoCajaModulo,
                                                                    entidad_remitente_caja: nuevoEntidadRemitenteCaja,
                                                                    acta_trans_caja: nuevoActaTransCaja,
                                                                    fecha_trans_caja: nuevoFechaTransCaja,
                                                                    entidad_productora_caja: nuevoEntidadProductoraCaja,
                                                                    unidad_administrativa_caja: nuevoUnidadAdministrativaCaja,
                                                                    oficina_productora_caja: nuevoOficinaProductoraCaja,
                                                                    objeto_caja: nuevoObjetoCaja,
                                                                    estado_caja: nuevoestadocaja
                                                                })
                                                            })
                                                            .then(response => {
                                                                if (response.ok) {
                                                                    alert('Módulo de caja actualizado');
                                                                    cargarModulos(); // Actualizar la lista de módulos
                                                                    document.getElementById('modalEditarModuloCaja').style.display = 'none'; // Cerrar modal
                                                                } else {
                                                                    return response.text().then(text => {
                                                                        alert(`Error al actualizar módulo de caja: ${text}`);
                                                                    });
                                                                }
                                                            })
                                                            .catch(error => {
                                                                console.error('Error al actualizar módulo de caja:', error);
                                                                alert('Error al actualizar módulo de caja');
                                                            });
                                                        } else {
                                                            alert('Por favor, complete todos los campos.');
                                                        }
                                                    };
                                                });
                                            });
                                        
                                            // Cerrar modal de edición
                                            document.getElementById('cerrarModalEditar').addEventListener('click', () => {
                                                document.getElementById('modalEditarModuloCaja').style.display = 'none';
                                            });
                                        
                                            document.querySelectorAll('.eliminar-modulo').forEach(btn => {
                                                btn.addEventListener('click', (event) => {
                                                    const id = event.target.dataset.id;
                                                    if (confirm('¿Estás seguro de que deseas eliminar este módulo de caja?')) {
                                                        fetch(`http://200.100.20.66:3000/modulos_caja/${id}`, {
                                                            method: 'DELETE'
                                                        })
                                                        .then(response => {
                                                            if (response.ok) {
                                                                alert('Módulo de caja eliminado');
                                                                cargarModulos(); // Actualizar la lista de módulos
                                                            } else {
                                                                return response.text().then(text => {
                                                                    alert(`Error al eliminar módulo de caja: ${text}`);
                                                                });
                                                            }
                                                        })
                                                        .catch(error => {
                                                            console.error('Error al eliminar módulo de caja:', error);
                                                            alert('Error al eliminar módulo de caja');
                                                        });
                                                    }
                                                });
                                            });
                                        
                                            // Registrar eventos para "Agregar Técnica" y "Agregar Calidad"
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
                                                                // Determina la URL correcta dependiendo del rol
                                                                const urlAsignados = rolSeleccionado === 'TECNICA'
                                                                    ? `http://200.100.20.66:3000/modulos_caja/${moduloId}/usuarios`
                                                                    : `http://200.100.20.66:3000/modulos_caja_calidad/${moduloId}/usuarios`;  // URL para Calidad
                                                                
                                                                fetch(urlAsignados)
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
                                            
                                            
                                            
                                            
                                        
                                            // Registrar eventos para "Ingresar" y "Ver"
                                            // Capturar eventos para "Ingresar" y "Ver"
                                                    document.querySelectorAll('.ingresar').forEach(btn => {
                                                        btn.addEventListener('click', (event) => {
                                                            const moduloId = event.target.dataset.id;

                                                            // Capturar el parámetro de la URL
                                                            const urlParams = new URLSearchParams(window.location.search);
                                                            const idModuloCliente = urlParams.get('id_modulo_cliente');

                                                            // Limpiar localStorage y guardar datos
                                                            localStorage.clear();
                                                            localStorage.setItem('id_modulo_cliente', idModuloCliente);

                                                            // Guardar otros datos relevantes
                                                            const parentElement = event.target.parentElement;
                                                            const cajaData = {
                                                                caja: parentElement.querySelector('.caja-modulo').textContent.split(': ')[1],
                                                                entidad_remitente: parentElement.querySelector('.entidad-remitente').textContent.split(': ')[1],
                                                                nro_acta_transferible: parentElement.querySelector('.acta-transferencia').textContent.split(': ')[1],
                                                                fecha_transferencia: parentElement.querySelector('.fecha-transferencia input').value,
                                                                entidad_productora: parentElement.querySelector('.entidad-productora').textContent.split(': ')[1],
                                                                unidad_administrativa: parentElement.querySelector('.unidad-administrativa').textContent.split(': ')[1],
                                                                oficina_productora: parentElement.querySelector('.oficina-productora').textContent.split(': ')[1],
                                                                objeto: parentElement.querySelector('.objeto').textContent.split(': ')[1],
                                                            };

                                                            // Guardar en localStorage
                                                            Object.entries(cajaData).forEach(([key, value]) => localStorage.setItem(key, value));

                                                            // Redirigir a Datos.html
                                                            window.location.href = `Datos.html?moduloId=${moduloId}`;
                                                        });
                                                    });
                                                                                        
                                            
                                            document.querySelectorAll('.ver').forEach(btn => {
                                                btn.addEventListener('click', (event) => {
                                                    const moduloId = event.target.dataset.id;
                                                    const cajaModulo = event.target.parentElement.querySelector('p:nth-child(1)').textContent.split(': ')[1];
                                                    const urlParams = new URLSearchParams(window.location.search);
                                                    const idModuloCliente = urlParams.get('id_modulo_cliente');

                                                    // Limpiar localStorage y guardar datos
                                                    localStorage.clear();
                                                    localStorage.setItem('id_modulo_cliente', idModuloCliente);
                                            
                                                    // Guardar el valor de caja en localStorage
                                                    localStorage.setItem('caja', cajaModulo);
                                                    localStorage.setItem('origen', 'modulo_caja');  // Establecer origen para distinguir entre peticiones
                                            
                                                    // Redirigir a Tabla.html con el valor de caja almacenado en localStorage
                                                    window.location.href = `Tabla.html?moduloId=${moduloId}`;
                                                });
                                            });
                                        }
                                        

                                                                                // Obtener el rol del usuario y cargar los módulos de caja
                                                                                fetch('http://200.100.20.66:3000/currentUser')
                                                                                    .then(response => response.json())
                                                                                    .then(user => {
                                                                                        window.usuarioRol = user.rol;
                                                                                        window.sede = user.sede;  // Guardar la sede del líder
                                                                                        document.getElementById('usuario-nombre').textContent = user.nombre;

                                                                                        cargarModulos();  // Cargar los módulos de caja
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
                                            const tablaAsignacion = rol === 'tecnica' ? 'asignacion_caja_tecnica' : 'asignacion_caja_calidad';

                                            if (seleccionados.length > 0) {
                                                const idsSeleccionados = Array.from(seleccionados).map(checkbox => checkbox.dataset.id);

                                                // Enviar los IDs seleccionados al servidor para agregarlos al módulo
                                                fetch(`http://200.100.20.66:3000/${tablaAsignacion}`, {
                                                    method: 'POST',
                                                    headers: {
                                                        'Content-Type': 'application/json'
                                                    },
                                                    body: JSON.stringify({
                                                        modulo_id: moduloId,
                                                        usuarios: idsSeleccionados
                                                    })
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
                                            } else {
                                                alert('No has seleccionado a ningún usuario');
                                            }
                                        });

                                        // Función para eliminar usuarios seleccionados de un módulo
                                        document.getElementById('eliminarSeleccionados').addEventListener('click', () => {
                                            const seleccionados = document.querySelectorAll('.usuario-seleccionado:checked');
                                            const moduloId = document.getElementById('eliminarSeleccionados').dataset.moduloId;
                                            const rol = document.getElementById('eliminarSeleccionados').dataset.rol;
                                            const tablaAsignacion = rol === 'tecnica' ? 'asignacion_caja_tecnica' : 'asignacion_caja_calidad';

                                            if (seleccionados.length > 0) {
                                                const idsSeleccionados = Array.from(seleccionados).map(checkbox => checkbox.dataset.id);

                                                // Enviar los IDs seleccionados al servidor para eliminarlos del módulo
                                                fetch(`http://200.100.20.66:3000/${tablaAsignacion}/${moduloId}/eliminar`, {
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

                    // Función para cerrar el modal
                    function cerrarModal() {
                        const modal = document.getElementById('modalSeleccionUsuario');
                        modal.style.display = 'none';
                    }

                    // Evento para cerrar el modal al hacer clic en el botón de cerrar
                    document.getElementById('cerrarModal').addEventListener('click', cerrarModal);


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
                    })
 



                    
// Variables
const btnAbrirModal = document.getElementById('btn_Calidad'); // Botón en el header para abrir el modal
const modal = document.getElementById('modalAsignarCajasCalidad');
const btnCerrarModal = modal.querySelector('.close');
const btnAsignarCajas = document.getElementById('btnAsignarCajasCalidad'); // Botón para asignar cajas
const cajaInicioInput = document.getElementById('cajaInicioCalidad');
const cajaFinInput = document.getElementById('cajaFinCalidad');
const usuariosCalidadDiv = document.getElementById('usuariosCalidad');

// Obtener el código de caja almacenado en localStorage
const codigoCaja = localStorage.getItem('caja_modulo');
if (!codigoCaja) {
    console.warn('No se encontró "caja_modulo" en localStorage.');
}

// Función para abrir el modal
btnAbrirModal.addEventListener('click', () => {
    console.log('Botón "Abrir Modal" clickeado');
    modal.style.display = 'block';

    // Prefijar los campos de caja con el valor del localStorage
    if (codigoCaja) {
        cajaInicioInput.value = `${codigoCaja}C`;
        cajaFinInput.value = `${codigoCaja}C`;
    }

    // Llamada a la API para obtener los usuarios de calidad de la sede
    const sede = window.sede; // O la variable donde tengas almacenada la sede actual
    console.log(`Sede actual: ${sede}`);

    fetch(`http://200.100.20.66:3000/usuarios/calidad?sede=${encodeURIComponent(sede)}`)
        .then(response => response.json())
        .then(usuarios => {
            console.log('Usuarios de calidad obtenidos:', usuarios);
            usuariosCalidadDiv.innerHTML = ''; // Limpiar la lista
            usuarios.forEach(usuario => {
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = usuario.id;
                checkbox.id = `usuario-${usuario.id}`;

                const label = document.createElement('label');
                label.setAttribute('for', checkbox.id);
                label.textContent = `${usuario.nombre} (${usuario.sede})`;

                const divUsuario = document.createElement('div');
                divUsuario.appendChild(checkbox);
                divUsuario.appendChild(label);

                usuariosCalidadDiv.appendChild(divUsuario);
            });
        })
        .catch(error => {
            console.error('Error al obtener usuarios de calidad:', error);
        });
});

// Función para cerrar el modal
btnCerrarModal.addEventListener('click', () => {
    console.log('Botón "Cerrar Modal" clickeado');
    modal.style.display = 'none';
});

// Función para cerrar el modal si se hace clic fuera del mismo
window.addEventListener('click', (event) => {
    if (event.target === modal) {
        console.log('Clic fuera del modal detectado, cerrando modal');
        modal.style.display = 'none';
    }
});

// Asignar cajas a calidad
btnAsignarCajas.addEventListener('click', () => {
    console.log('Botón "Asignar Cajas" clickeado');
    const cajaInicio = `${codigoCaja}C${cajaInicioInput.value.slice(codigoCaja.length + 1).trim()}`;
    const cajaFin = `${codigoCaja}C${cajaFinInput.value.slice(codigoCaja.length + 1).trim()}`;

    if (!cajaInicio || !cajaFin) {
        alert('Por favor ingrese el rango de cajas');
        return;
    }

    console.log(`Rango de cajas ingresado: ${cajaInicio} - ${cajaFin}`);

    const regex = /^\d{3}C\d{6}$/; 
    if (!regex.test(cajaInicio) || !regex.test(cajaFin)) {
        alert('El rango de cajas debe ser válido )');
        return;
    }

    // Obtener los usuarios seleccionados
    const usuariosSeleccionados = Array.from(document.querySelectorAll('#usuariosCalidad input[type="checkbox"]:checked'))
        .map(checkbox => checkbox.value);

    console.log('Usuarios seleccionados:', usuariosSeleccionados);

    if (usuariosSeleccionados.length === 0) {
        alert('Por favor, seleccione al menos un usuario.');
        return;
    }

    // Enviar directamente el rango sin generar cajas adicionales
    console.log('Enviando asignación al backend:', {
        modulo_id: 1, // Cambiar por el valor dinámico si corresponde
        usuarios: usuariosSeleccionados,
        rango_inicio: cajaInicio,
        rango_fin: cajaFin,
    });

    fetch('http://200.100.20.66:3000/asignacion_caja_calidad/rango', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            modulo_id: 1, // Cambiar por el valor dinámico si corresponde
            usuarios: usuariosSeleccionados,
            rango_inicio: cajaInicio,
            rango_fin: cajaFin,
        }),
    })
        .then(response => response.json())
        .then(data => {
            console.log('Respuesta del servidor:', data);
            alert(data.message);
            modal.style.display = 'none'; // Cerrar modal al completar la asignación
        })
        .catch(error => {
            console.error('Error al asignar cajas:', error);
            alert('Error al asignar las cajas.');
        });
});


            fetch('http://200.100.20.66:3000/currentUser')
                .then(response => response.json())
                .then(user => {
                    window.usuarioRol = user.rol;
                    window.sede = user.sede; // Guardar la sede del LIDER
                    document.getElementById('usuario-nombre').textContent = user.nombre;

                    cargarModulos(); // Cargar los módulos

                    // Controlar la visibilidad del botón "VER TABLA"
                    const tablaBtn = document.getElementById('btn_Calidad');
                    if (window.usuarioRol === 'LIDER' || window.usuarioRol === 'ADMIN') {
                        tablaBtn.style.display = 'block';
                    } else {
                        tablaBtn.style.display = 'none';
                    }

                    
                    tablaBtn.addEventListener('click', () => {
                        // En lugar de redirigir, realiza alguna otra acción aquí
                        console.log('Acción de visualización de tabla realizada.');
                        // Aquí puedes agregar la lógica que prefieras para mostrar contenido o interactuar con el usuario sin redirigir
                    });
                })
                .catch(error => {
                    console.error('Error al obtener información del usuario:', error);
                    alert('Error al obtener información del usuario');
                });




                 
});