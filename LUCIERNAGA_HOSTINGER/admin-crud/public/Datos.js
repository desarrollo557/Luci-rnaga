document.addEventListener('DOMContentLoaded', function () {

    // Fecha actual para el formulario
const today = new Date().toISOString().split('T')[0];
document.getElementById('fecha_del_dato').value = today;

// Obtener datos del usuario actual para mostrar en el formulario
fetch('/currentUser')
    .then(response => response.json())
    .then(data => {
        if (data.nombre && data.cc) {
            document.getElementById('elaborado_por').value = `${data.nombre} (${data.cc})`;
        }
        if (data.sede) {
            document.getElementById('sede').value = data.sede;
        }
    })
    .catch(error => {
        console.error('Error al obtener datos del usuario:', error);
    });

// Recuperar datos desde localStorage$
const idModuloCliente = localStorage.getItem('id_modulo_cliente');
const caja = localStorage.getItem('caja');
const codigo = localStorage.getItem('codigo');
const entidadRemitente = localStorage.getItem('entidad_remitente');
const nroActaTransferible = localStorage.getItem('nro_acta_transferible');
const fechaTransferencia = localStorage.getItem('fecha_transferencia');
const entidadProductoraCaja = localStorage.getItem('entidad_productora');
const unidadAdministrativaCaja = localStorage.getItem('unidad_administrativa');
const oficinaProductoraCaja = localStorage.getItem('oficina_productora');
const objetoCaja = localStorage.getItem('objeto');

// Asignar valores recuperados desde localStorage a los campos correspondientes
if (caja) document.getElementById('caja').value = caja.toUpperCase();
if (codigo) document.getElementById('codigo').value = codigo.toUpperCase();
if (entidadRemitente) document.getElementById('entidad_remitente').value = entidadRemitente.toUpperCase();
if (nroActaTransferible) document.getElementById('nro_acta_transferible').value = nroActaTransferible.toUpperCase();
if (fechaTransferencia) document.getElementById('fecha_transferencia').value = fechaTransferencia;
if (entidadProductoraCaja) document.getElementById('entidad_productora').value = entidadProductoraCaja.toUpperCase();
if (unidadAdministrativaCaja) document.getElementById('unidad_administrativa').value = unidadAdministrativaCaja.toUpperCase();
if (oficinaProductoraCaja) document.getElementById('oficina_productora').value = oficinaProductoraCaja.toUpperCase();
if (objetoCaja) document.getElementById('objeto').value = objetoCaja.toUpperCase();


const cajaInternaInput = document.getElementById('caja_interna');
const storedCajaInterna = localStorage.getItem('caja_interna');

// Si existe un valor previo, asignarlo al campo correspondiente
if (storedCajaInterna) {
    cajaInternaInput.value = storedCajaInterna;
}

// Guardar automáticamente en localStorage cada vez que se escriba algo
cajaInternaInput.addEventListener('input', () => {
    const currentValue = cajaInternaInput.value;
    localStorage.setItem('caja_interna', currentValue);
});


// Configurar botón para regresar a Modulo_Caja.html con el ID correcto
document.getElementById('regresar-btn').addEventListener('click', () => {
    if (idModuloCliente) {
        // Redirigir con el parámetro de ID
        window.location.href = `Modulo_Caja.html?id_modulo_cliente=${idModuloCliente}`;
    } else {
        // Manejar el caso en que no se encuentra el ID en localStorage
        console.error('No se encontró id_modulo_cliente en localStorage.');
        alert('No se puede regresar porque falta el identificador del módulo.');
    }
});


    // Función para formatear el valor de UPD
    function formatUpdValue(updValue) {
        const str = (updValue || '').toUpperCase();
        const numericValue = str.replace(/\D/g, '');
        const formattedValue = numericValue.padStart(7, '0').slice(-7);
        return `UPD${formattedValue}`;
    }

    // Validar fechas, permitiendo que sean iguales
    function validateDates(fechaInicial, fechaFinal) {
        const fechaInicialDate = new Date(fechaInicial);
        const fechaFinalDate = new Date(fechaFinal);
        const limiteFechaInicial = new Date('1950-01-01');

        if (fechaInicialDate <= limiteFechaInicial) {
            alert('La fecha inicial no puede ser anterior al año 1950.');
            return false;
        }

        if (fechaFinalDate < fechaInicialDate) {
            alert('La fecha final no puede ser menor que la fecha inicial.');
            return false;
        }

        return true;
    }

    // Función para verificar duplicados en el campo UPD
    function checkDuplicateUpd(updValue, id) {
        return fetch(`/fuiddatosreal/check-duplicate-upd?upd=${encodeURIComponent(updValue)}`)
            .then(response => response.json())
            .then(data => {
                if (data.exists && data.id !== id) {
                    return true;
                } else {
                    return false;
                }
            })
            .catch(error => {
                console.error('Error al verificar duplicados en UPD:', error);
                return false;
            });
    }

    // Función para verificar duplicados de caja
    async function checkCajaDuplicates(cajaValue) {
        try {
            const response = await fetch(`/fuiddatosreal/check-caja-duplicates?caja=${encodeURIComponent(cajaValue)}`);
            const data = await response.json();

            const duplicateCount = Number(data.count) || 0;
            console.log('Conteo de duplicados procesado:', duplicateCount);

            return duplicateCount; // Devuelve el número de duplicados procesado
        } catch (error) {
            console.error('Error al verificar duplicados en caja:', error);
            return 0; // Si hay algún error, considerar que no hay duplicados
        }
    }

    // Función para manejar el envío del formulario
    async function handleSubmit(event) {
        event.preventDefault(); // Evitar envío tradicional

        const form = event.target; // Formulario actual
        const submitButton = form.querySelector('#submit-btn');
        if (submitButton) submitButton.disabled = true;

        // Capturar inputs del DOM actual
        const getValue = (id, defaultVal = '') => (form.querySelector('#' + id)?.value || defaultVal).toString();

        const id = getValue('record_id');
        const updValue = formatUpdValue(getValue('upd').toUpperCase());
        const radicado = getValue('radicado', 'N/A').toUpperCase();
        const entidad_remitente = getValue('entidad_remitente', 'N/A').toUpperCase();
        const fechaInicial = getValue('fecha_inicial');
        const fechaFinal = getValue('fecha_final');

        // Verificar duplicados UPD
        const isDuplicate = await checkDuplicateUpd(updValue, id);
        if (isDuplicate) {
            alert('Error: El valor UPD ya existe en la base de datos y no se puede duplicar.');
            if (submitButton) submitButton.disabled = false;
            return;
        }

        // Validar fechas
        if (!validateDates(fechaInicial, fechaFinal)) {
            if (submitButton) submitButton.disabled = false;
            return;
        }

        // Caja
        const valorCajaUsuario = getValue('caja').toUpperCase();
        let nOrden;

        if (id) {
            nOrden = getValue('n_orden');
        } else {
            const response = await fetch(`/fuiddatosreal?caja=${encodeURIComponent(valorCajaUsuario)}`);
            const data = await response.json();
            const maxNOrden = data
                .map(record => parseInt(record.n_orden) || 0)
                .reduce((max, curr) => Math.max(max, curr), 0);
            nOrden = maxNOrden;
        }

        form.querySelector('#n_orden').value = nOrden;

        // Construir objeto de datos
        const datos = {
            fecha_del_dato: getValue('fecha_del_dato').toUpperCase(),
            n_orden: nOrden.toString(),
            codigo: getValue('codigo', 'N/A').toUpperCase(),
            entidad_remitente,
            entidad_productora: getValue('entidad_productora', 'N/A').toUpperCase(),
            unidad_administrativa: getValue('unidad_administrativa', 'N/A').toUpperCase(),
            oficina_productora: getValue('oficina_productora', 'N/A').toUpperCase(),
            objeto: getValue('objeto', 'N/A').toUpperCase(),
            serie: getValue('serie', 'N/A').toUpperCase(),
            subserie: getValue('subserie', 'N/A').toUpperCase(),
            numero_de_orden_interno: getValue('numero_de_orden_interno', 'N/A').toUpperCase(),
            accionado_procesado: getValue('accionado_procesado', 'N/A').toUpperCase(),
            accionado_denunciante: getValue('accionado_denunciante', 'N/A').toUpperCase(),
            identificacion: getValue('identificacion', 'N/A').toUpperCase(),
            asunto: getValue('asunto', '').toUpperCase(),
            radicado,
            numero_doc: getValue('numero_doc', 'N/A').toUpperCase(),
            numero_doc_hasta: getValue('numero_doc_hasta', 'N/A').toUpperCase(),
            fecha_inicial: fechaInicial || null,
            fecha_final: fechaFinal || null,
            caja: valorCajaUsuario,
            upd: updValue,
            tomo: getValue('tomo', 'N/A').toUpperCase(),
            caja_interna: getValue('caja_interna', 'N/A').toUpperCase(),
            otro: getValue('otro', '').toUpperCase(),
            folios: getValue('folios', 'N/A').toUpperCase(),
            soporte: getValue('soporte', '').toUpperCase(),
            frecuencia: getValue('frecuencia', '').toUpperCase(),
            elaborado_por: getValue('elaborado_por', '').toUpperCase(),
            nro_acta_transferible: getValue('nro_acta_transferible', 'N/A').toUpperCase(),
            fecha_transferencia: getValue('fecha_transferencia') || null,
            notas: getValue('notas', 'N/A').toUpperCase(),
            sede: getValue('sede', 'N/A').toUpperCase(),
            tiempo: getValue('tiempo', '').toUpperCase(),
            historial_y_cambios: getValue('historial_y_cambios', '').toUpperCase(),
            cambio_calidad: getValue('cambio_calidad', '').toUpperCase(),
            sede_calidad: getValue('sede_calidad', '').toUpperCase(),
            asunto_2: getValue('asunto_2', '').toUpperCase(),
            asunto_3: getValue('asunto_3', '').toUpperCase(),
        };

        // Enviar datos al backend
        try {
            const method = id ? 'PUT' : 'POST';
            const url = id ? `http://200.100.20.66:3000/fuiddatosreal/${id}` : 'http://200.100.20.66:3000/fuiddatosreal';

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(datos)
            });

            if (!response.ok) throw new Error('Error al guardar los datos');

            await response.json();
            alert('Datos guardados correctamente');
            window.location.href = 'Datos.html';
        } catch (error) {
            console.error('Error al guardar los datos:', error);
            alert('Error al guardar los datos');
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    }

    // Asignar evento
    document.getElementById('datos-form').addEventListener('submit', handleSubmit);
});

const urlParams = new URLSearchParams(window.location.search);
const id = urlParams.get('id');

if (id) {
    loadData(id); // Cargar los datos de un registro específico si hay un id
} else {
    loadDatos(); // Cargar los datos si no hay un id específico
}

// Manejar la visualización de la tabla
const toggleButton = document.getElementById('toggle-table-btn');
const tableContainer = document.getElementById('data-table-container');

toggleButton.addEventListener('click', () => {
    if (tableContainer.style.display === 'none' || tableContainer.style.display === '') {
        tableContainer.style.display = 'block';
    } else {
        tableContainer.style.display = 'none';
    }
});

// Agregar funcionalidad de búsqueda en la tabla
const searchInput = document.getElementById('searchInput');
searchInput.addEventListener('input', function () {
    const searchTerm = searchInput.value.toLowerCase();
    const tableRows = document.querySelectorAll('#data-table tbody tr');
    
    tableRows.forEach(row => {
        const cells = row.getElementsByTagName('td');
        const rowText = Array.from(cells).map(cell => cell.textContent.toLowerCase()).join(' ');
        row.style.display = rowText.includes(searchTerm) ? '' : 'none';
    });
});

// Función para cargar todos los datos, filtrando por fecha y caja
function loadDatos() {
    const caja = localStorage.getItem('caja');
    const today = new Date().toISOString().split('T')[0]; // Obtener la fecha de hoy en formato 'YYYY-MM-DD'
    
    if (!caja) {
        alert('No se encontró ninguna caja en el almacenamiento local.');
        return;
    }

    fetch('/fuiddatosreal')
        .then(response => response.json())
        .then(data => {
            // Filtrar los datos por "caja" y "fecha_del_dato" igual a la fecha de hoy
            const filteredData = data.filter(record => {
                const recordDate = new Date(record.fecha_del_dato).toISOString().split('T')[0];
                return (
                    record.caja && 
                    record.caja.toUpperCase() === caja.toUpperCase() &&
                    recordDate === today
                );
            });

            if (filteredData.length > 0) {
                displayData(filteredData); // Mostrar solo los datos filtrados
            } else {
                alert('No se encontraron datos para la caja especificada en la fecha actual.');
                displayData([]); // Mostrar tabla vacía si no hay datos
            }

            // Sugerir el siguiente valor de `upd` y `tomo` en secuencia para la misma `caja`
            suggestNextUpdAndTomo(data, caja);
        })
        .catch(error => {
            console.error('Error al cargar los datos:', error);
            alert('Error al cargar los datos.');
        });
}

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


// Función para sugerir el siguiente valor upd y tomo en la misma caja
function suggestNextUpdAndTomo(data, caja) {
   
    const registrosCaja = data.filter(record => record.caja && record.caja.toUpperCase() === caja.toUpperCase());

    
    if (registrosCaja.length > 0) {
        // Obtener el último registro ingresado
        const ultimoRegistro = registrosCaja[registrosCaja.length - 1];
        const ultimoUpd = parseInt(ultimoRegistro.upd.replace('UPD', ''), 10); 

        if (!isNaN(ultimoUpd)) {
            const siguienteUpd = `${String(ultimoUpd + 1).padStart(7, '0')}`; 
            document.getElementById('upd').value = siguienteUpd;
        } else {
            document.getElementById('upd').value = 'UPD0000001'; 
        }
    } else {
        document.getElementById('upd').value = 'UPD0000001'; 
    }

    // Calcular siguiente valor para `tomo`
    if (registrosCaja.length > 0) {
        const ultimoTomo = Math.max(...registrosCaja.map(record => parseInt(record.tomo, 10) || 0)); // Encontrar el máximo
        const siguienteTomo = ultimoTomo + 1; 
        document.getElementById('tomo').value = siguienteTomo;
    } else {
        document.getElementById('tomo').value = '1';
    }
}

// Función para cargar un registro específico para edición
function loadData(id) {
    fetch(`/fuiddatosreal/${id}`)
        .then(response => response.json())
        .then(data => {
            if (data && data.length > 0) {
                const record = data[0];

                // Asignar los valores a los campos del formulario
                document.getElementById('fecha_del_dato').value = formatDate(record.fecha_del_dato);
                document.getElementById('n_orden').value = record.n_orden || '';
                document.getElementById('codigo').value = record.codigo || '';
                document.getElementById('entidad_remitente').value = record.entidad_remitente || '';
                document.getElementById('entidad_productora').value = record.entidad_productora || '';
                document.getElementById('unidad_administrativa').value = record.unidad_administrativa || '';
                document.getElementById('oficina_productora').value = record.oficina_productora || '';
                document.getElementById('objeto').value = record.objeto || '';
                document.getElementById('serie').value = record.serie || '';
                document.getElementById('subserie').value = record.subserie || '';
                document.getElementById('numero_de_orden_interno').value = record.numero_de_orden_interno || '';
                document.getElementById('accionado_procesado').value = record.accionado_procesado || '';
                document.getElementById('accionado_denunciante').value = record.accionado_denunciante || '';
                document.getElementById('identificacion').value = record.identificacion || '';
                document.getElementById('asunto').value = record.asunto || '';            
                document.getElementById('radicado').value = record.radicado || '';
                document.getElementById('numero_doc').value = record.numero_doc || '';
                document.getElementById('numero_doc_hasta').value = record.numero_doc_hasta || '';
                document.getElementById('fecha_inicial').value = formatDate(record.fecha_inicial);
                document.getElementById('fecha_final').value = formatDate(record.fecha_final);
                document.getElementById('caja').value = record.caja || '';
                document.getElementById('upd').value = record.upd ? record.upd.replace('UPD', '') : ''; 
                document.getElementById('tomo').value = record.tomo || '';
                document.getElementById('otro').value = record.otro || '';
                document.getElementById('caja_interna').value = record.caja_interna || '';
                document.getElementById('folios').value = record.folios || '';
                document.getElementById('soporte').value = record.soporte || '';
                document.getElementById('frecuencia').value = record.frecuencia || '';
                document.getElementById('elaborado_por').value = record.elaborado_por || '';
                document.getElementById('nro_acta_transferible').value = record.nro_acta_transferible || '';
                document.getElementById('fecha_transferencia').value = formatDate(record.fecha_transferencia);
                document.getElementById('notas').value = record.notas || '';
                document.getElementById('sede').value = record.sede || '';
                document.getElementById('tiempo').value = record.tiempo || '';
                document.getElementById('historial_y_cambios').value = record.historial_y_cambios || '';
                document.getElementById('cambio_calidad').value = record.cambio_calidad || '';
                document.getElementById('sede_calidad').value = record.sede_calidad || '';
                document.getElementById('asunto_2').value = record.asunto_2 || '';
                document.getElementById('asunto_3').value = record.asunto_3 || '';
                document.getElementById('record_id').value = record.id || ''; 

            } else {
                alert('No se encontraron datos con el ID especificado.');
            }
        })
        .catch(error => {
            console.error('Error al cargar los datos:', error);
            alert('Error al cargar los datos.');
        });
}

// Función para formatear fechas al formato `yyyy-mm-dd`
function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    const year = d.getFullYear();
    const month = ('0' + (d.getMonth() + 1)).slice(-2);
    const day = ('0' + d.getDate()).slice(-2);
    return `${year}-${month}-${day}`;
}

// Función para mostrar los datos en la tabla
function displayData(data) {
    const table = document.getElementById('data-table').getElementsByTagName('tbody')[0];
    table.innerHTML = ''; // Limpiar la tabla antes de cargar nuevos datos

    // Crear filas solo para los datos filtrados
    data.forEach(record => {
        const row = document.createElement('tr');

        // Agregar celdas de datos
        for (const key in record) {
            if (record.hasOwnProperty(key)) {
                const cell = document.createElement('td');
                cell.textContent = record[key] || ''; // Mostrar los valores de cada campo
                row.appendChild(cell);
            }
        }

        // Crear celda de acciones
        const actionCell = document.createElement('td');

        // Crear botón de editar
        const editButton = document.createElement('button');
        editButton.textContent = 'Editar';
        editButton.className = 'edit-btn';
        editButton.addEventListener('click', () => {
            window.location.href = `Datos.html?id=${record.id}`;
        }); 

        // Crear botón de eliminar
        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Eliminar';
        deleteButton.className = 'delete-btn';
        deleteButton.addEventListener('click', () => {
            if (confirm('¿Estás seguro de que deseas eliminar este registro?')) {
                deleteRecord(record.id);
            }
        });

        actionCell.appendChild(editButton);
        actionCell.appendChild(deleteButton);
        row.appendChild(actionCell);

        table.appendChild(row);
    });

    // Si no hay datos para mostrar, mostrar un mensaje
    if (data.length === 0) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.textContent = 'No se encontraron datos con los criterios especificados';
        cell.colSpan = table.parentElement.querySelectorAll('th').length; // Ajustar al número de columnas
        row.appendChild(cell);
        table.appendChild(row);
    }
}

// Función para eliminar un registro
function deleteRecord(id) {
    fetch(`http://200.100.20.66:3000/fuiddatosreal/${id}`, {
        method: 'DELETE'
    })
    .then(response => {
        console.log('Respuesta del servidor:', response); // Verificar la respuesta
        return response.json();
    })
    .then(() => {
        alert('Registro eliminado correctamente');
        loadDatos(); // Volver a cargar los datos después de eliminar
    })
    .catch(error => {
        console.error('Error al eliminar el registro:', error);
        alert('Error al eliminar el registro');
    });
}

// Función para manejar el logout
document.getElementById('salir-btn').addEventListener('click', () => {
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
//
document.addEventListener("DOMContentLoaded", async function() {
    try {
        // 1️⃣ Obtener la sede del usuario
        const response = await fetch('/currentUser');
        const userData = await response.json();
        const sede = userData.sede ? userData.sede.trim() : '';

        // 2️⃣ Reorganizar formulario según sede
        if (sede === 'SANTA MARTA-PROYECTO') {
            aplicarOrdenSantaMarta();
        } else {
            aplicarOrdenNormal();
        }
    } catch (error) {
        console.error('Error al obtener datos del usuario:', error);
        aplicarOrdenNormal();
    }

    // 3️⃣ Inicializar autocompletado después de reorganizar el formulario
    inicializarAutocompletado();
});

function inicializarAutocompletado() {
    const camposAutocompletar = [
        'entidad_productora',
        'codigo',
        'unidad_administrativa',
        'oficina_productora',
        'objeto',
        'serie',
        'asunto_2',
        'subserie',
        'radicado',
        'numero_doc',
        'numero_doc_hasta',
        'caja_interna',
        'notas'
    ];

    camposAutocompletar.forEach(campo => setupAutocomplete(campo));
}

function setupAutocomplete(campo) {
    const input = document.getElementById(campo);
    if (!input) return;

    let timeoutId;
    let currentFocus = -1;

    input.addEventListener('input', function () {
        clearTimeout(timeoutId);
        const valorCaja = localStorage.getItem('caja');
        const inputValue = this.value;

        if (inputValue.trim() === '') {
            clearSuggestions(campo);
            return;
        }

        if (inputValue.length > 2) {
            timeoutId = setTimeout(() => {
                obtenerSugerencias(valorCaja, campo, inputValue);
            }, 300);
        }
    });

    input.addEventListener('keydown', function(e) {
        const suggestionBox = document.getElementById(`suggestion-box-${campo}`);
        let items = suggestionBox ? suggestionBox.getElementsByTagName('li') : [];

        if (e.key === 'ArrowDown') {
            currentFocus++;
            addActive(items);
        } else if (e.key === 'ArrowUp') {
            currentFocus--;
            addActive(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (currentFocus > -1 && items[currentFocus]) {
                items[currentFocus].click();
            }
        }
    });

    async function obtenerSugerencias(caja, campo, query) {
        try {
            const response = await fetch(`http://200.100.20.66:3000/fuiddatosreal/${caja}/suggestions/${campo}?q=${encodeURIComponent(query)}`);
            if (!response.ok) throw new Error(`Error al obtener sugerencias para ${campo}`);
            const suggestions = await response.json();
            mostrarSugerencias(campo, suggestions);
        } catch (error) {
            console.error(`Error al obtener sugerencias para ${campo}:`, error.message);
        }
    }

    function mostrarSugerencias(campo, suggestions) {
        let suggestionBox = document.getElementById(`suggestion-box-${campo}`);
        if (!suggestionBox) {
            suggestionBox = document.createElement('ul');
            suggestionBox.id = `suggestion-box-${campo}`;
            suggestionBox.style.position = 'absolute';
            suggestionBox.style.zIndex = '1000';
            suggestionBox.style.backgroundColor = '#fff';
            suggestionBox.style.border = '1px solid #ccc';
            suggestionBox.style.listStyle = 'none';
            suggestionBox.style.padding = '0';
            suggestionBox.style.margin = '0';
            document.getElementById(campo).parentNode.appendChild(suggestionBox);
        }

        suggestionBox.innerHTML = '';
        currentFocus = -1;

        if (suggestions.length === 0) {
            suggestionBox.style.display = 'none';
            return;
        }

        suggestions.forEach(suggestion => {
            const item = document.createElement('li');
            item.textContent = suggestion;
            item.style.padding = '5px';
            item.style.cursor = 'pointer';
            item.addEventListener('click', function () {
                input.value = suggestion;
                clearSuggestions(campo);
            });
            suggestionBox.appendChild(item);
        });

        suggestionBox.style.display = 'block';
    }

    function clearSuggestions(campo) {
        const suggestionBox = document.getElementById(`suggestion-box-${campo}`);
        if (suggestionBox) {
            suggestionBox.innerHTML = '';
            suggestionBox.style.display = 'none';
        }
    }

    function addActive(items) {
        if (!items) return;
        removeActive(items);
        if (currentFocus >= items.length) currentFocus = 0;
        if (currentFocus < 0) currentFocus = items.length - 1;
        items[currentFocus].classList.add('active');
    }

    function removeActive(items) {
        for (let i = 0; i < items.length; i++) {
            items[i].classList.remove('active');
        }
    }
}
