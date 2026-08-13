// === Funciones para obtener sede y columnas ===
async function getUserSede() {
    try {
        // Primero intentar desde localStorage
        const userData = JSON.parse(localStorage.getItem('userData') || '{}');
        if (userData.sede) {
            console.log("Sede obtenida desde localStorage:", userData.sede);
            return userData.sede;
        }
        
        // Si no está en localStorage, intentar desde el backend
        const response = await fetch('/currentUser');
        if (response.ok) {
            const data = await response.json();
            const sede = data.sede || "OTRA SEDE";
            console.log("Sede obtenida desde backend:", sede);
            return sede;
        }
    } catch (err) {
        console.error("Error obteniendo sede:", err);
    }
    
    const defaultSede = "OTRA SEDE";
    console.log("Sede por defecto:", defaultSede);
    return defaultSede;
}

function getColumnsBySede(sede) {
    console.log("Configurando columnas para sede:", sede);
    
    if (sede === "SANTA MARTA-PROYECTO") {
        return [
            { data: "id", title: "ID", width: "70px" },
            { data: "n_orden", title: "N° Orden" },
            { data: "codigo", title: "Código" },
            { data: "entidad_remitente", title: "Entidad Remitente" },
            { data: "entidad_productora", title: "Entidad Productora" },
            { data: "unidad_administrativa", title: "Unidad Admin" },
            { data: "oficina_productora", title: "Oficina Productora" },
            { data: "objeto", title: "Objeto" },
            
            // COLUMNAS ESPECÍFICAS DE SANTA MARTA
            { data: "numero_de_orden_interno", title: "N° Orden Interno" },
            { data: "accionado_procesado", title: "Accionado Procesado" },
            { data: "accionado_denunciante", title: "Accionado Denunciante" },
            { data: "identificacion", title: "Identificación" },
            
            { data: "radicado", title: "Radicado" },
            { data: "numero_doc", title: "Inicial" },
            { data: "numero_doc_hasta", title: "Final" },
            { data: "caja", title: "Caja" }, // VISIBLE para Santa Marta
            { data: "upd", title: "UPD" },
            { data: "tomo", title: "Tomo" },
            { data: "otro", title: "Otro" },
            { data: "caja_interna", title: "Caja Interna" },
            { data: "folios", title: "Folios" },
            { data: "soporte", title: "Soporte" },
            { data: "frecuencia", title: "Frecuencia" },
            { data: "notas", title: "Observaciones" },
            { data: "elaborado_por", title: "Elaborado Por" },
            { 
                data: "fecha_del_dato", 
                title: "Fecha Inventario", 
                render: d => d ? d.substring(0, 10) : '' 
            },
            { data: "nro_acta_transferible", title: "N° Acta Transferencia" },
            { 
                data: "fecha_transferencia", 
                title: "Fecha Transferencia", 
                render: d => d ? d.substring(0, 10) : '' 
            },
            { data: "sede", title: "Sede" },
            { 
                data: "estado_caja", 
                title: "Estado Caja",
                render: function(data) {
                    if (!data) return '';
                    const estado = data.toUpperCase();
                    const badgeClass = estado.includes('FINALIZADO') ? 'bg-success' : 
                                     estado.includes('PROCESO') ? 'bg-warning text-dark' : 'bg-secondary';
                    return `<span class="badge ${badgeClass}">${data}</span>`;
                }
            }
        ];
    } else {
        // COLUMNAS PARA OTRAS SEDES
        return [
            { data: "id", title: "ID", width: "70px" },
            { data: "n_orden", title: "N° Orden" },
            { data: "codigo", title: "Código" },
            { data: "entidad_remitente", title: "Entidad Remitente" },
            { data: "entidad_productora", title: "Entidad Productora" },
            { data: "unidad_administrativa", title: "Unidad Admin" },
            { data: "oficina_productora", title: "Oficina Productora" },
            { data: "objeto", title: "Objeto" },
            
            // COLUMNAS ESPECÍFICAS DE OTRAS SEDES
            { data: "serie", title: "Serie" },
            { data: "subserie", title: "Subserie" },
            { data: "asunto", title: "Asunto" },
            
            { data: "radicado", title: "Radicado" },
            { data: "numero_doc", title: "N° Doc Desde" },
            { data: "numero_doc_hasta", title: "N° Doc Hasta" },
            { 
                data: "fecha_inicial", 
                title: "Fecha Inicial", 
                render: d => d ? d.substring(0, 10) : '' 
            },
            { 
                data: "fecha_final", 
                title: "Fecha Final", 
                render: d => d ? d.substring(0, 10) : '' 
            },
            { data: "caja", title: "Caja" },
            { data: "upd", title: "UPD" },
            { data: "tomo", title: "Tomo" },
            { data: "otro", title: "Otro" },
            { data: "caja_interna", title: "Caja Interna" },
            { data: "folios", title: "Folios" },
            { data: "soporte", title: "Soporte" },
            { data: "frecuencia", title: "Frecuencia" },
            { data: "elaborado_por", title: "Elaborado Por" },
            { 
                data: "fecha_del_dato", 
                title: "Fecha Dato", 
                render: d => d ? d.substring(0, 10) : '' 
            },
            { data: "nro_acta_transferible", title: "N° Acta" },
            { 
                data: "fecha_transferencia", 
                title: "Fecha Transferencia", 
                render: d => d ? d.substring(0, 10) : '' 
            },
            { data: "notas", title: "Notas" },
            { data: "sede", title: "Sede" },
            { data: "tiempo", title: "Tiempo" },
            { 
                data: "estado_caja", 
                title: "Estado Caja",
                render: function(data) {
                    if (!data) return '';
                    const estado = data.toUpperCase();
                    const badgeClass = estado.includes('FINALIZADO') ? 'bg-success' : 
                                     estado.includes('PROCESO') ? 'bg-warning text-dark' : 'bg-secondary';
                    return `<span class="badge ${badgeClass}">${data}</span>`;
                }
            }
        ];
    }
}

// === CÓDIGO PRINCIPAL ===
$(document).ready(async function () {
    // 1. Obtener usuario de localStorage
    const producer = localStorage.getItem('currentProducer');
    
    // Verificar si hay un usuario definido
    if (!producer) {
        alert('No se identificó al usuario productor. Redirigiendo...');
        window.location.href = 'principal_modulo.html';
        return;
    }

    // 2. Obtener la sede del usuario
    const userSede = await getUserSede();
    const isSantaMarta = userSede === "SANTA MARTA-PROYECTO";
    
    console.log("=== CONFIGURACIÓN INICIAL ===");
    console.log("Usuario:", producer);
    console.log("Sede:", userSede);
    console.log("Es Santa Marta:", isSantaMarta);

    // 3. Configurar interfaz de usuario
    $('#dataTable').before(`
        <div id="user-controls" style="margin-bottom: 20px;">
            <div class="card">
                <div class="card-header bg-primary text-white">
                    <i class="fas fa-user-circle"></i> Usuario: ${producer} | Sede: ${userSede}
                </div>
                <div class="card-body">
                    <div class="row">
                        <div class="col-md-8">
                            <div class="row">
                                <div class="col-md-3">
                                    <div class="input-group mb-3">
                                        <span class="input-group-text">Desde</span>
                                        <input type="date" id="fechaDesde" class="form-control">
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <div class="input-group mb-3">
                                        <span class="input-group-text">Hasta</span>
                                        <input type="date" id="fechaHasta" class="form-control">
                                    </div>
                                </div>
                                <div class="col-md-3">
                                    <select id="filterEstado" class="form-select">
                                        <option value="">Todos los estados</option>
                                    </select>
                                </div>
                                <div class="col-md-3">
                                    <select id="filterEntidad" class="form-select">
                                        <option value="">Todas las entidades</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <div class="d-flex justify-content-end align-items-center h-100">
                                <span class="badge bg-secondary rounded-pill me-2">
                                    <i class="fas fa-file-alt"></i> <span id="record-count">0</span> registros
                                </span>
                                <button id="btnExport" class="btn btn-success btn-sm">
                                    <i class="fas fa-file-excel"></i> Exportar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `);

    // 4. Inicializar DataTable con las columnas correctas
    const table = $('#dataTable').DataTable({
        destroy: true,
        scrollX: true,
        fixedColumns: { start: 2 },
        ajax: {
            url: "http://200.100.20.66:3000/api/fuid-con-estado-caja",
            dataSrc: function(json) {
                console.log("=== FILTRADO DE DATOS ===");
                console.log("Datos recibidos:", json.length, "registros");
                
                // Filtrar por usuario Y por sede
                const userRecords = json.filter(item => {
                    const elaboradoPor = (item.elaborado_por || '').trim().toUpperCase();
                    const sedeRegistro = (item.sede || '').trim().toUpperCase();
                    const userSedeUpper = userSede.toUpperCase();
                    
                    const matchUser = elaboradoPor === producer.toUpperCase();
                    const matchSede = sedeRegistro === userSedeUpper;
                    
                    return matchUser && matchSede;
                });

                console.log(`Registros filtrados: ${userRecords.length}`);
                console.log(`Filtro aplicado: usuario="${producer}" AND sede="${userSede}"`);
                
                if (userRecords.length > 0) {
                    console.log("Ejemplo de registro filtrado:", {
                        id: userRecords[0].id,
                        elaborado_por: userRecords[0].elaborado_por,
                        sede: userRecords[0].sede,
                        caja: userRecords[0].caja
                    });
                }

                // Procesar datos para los filtros
                processFilterData(userRecords);
                $('#record-count').text(userRecords.length);
                
                return userRecords;
            },
            error: function(xhr, status, error) {
                console.error("Error al cargar datos:", status, error);
                alert("Error al cargar los datos. Consulte la consola.");
            }
        },
        // USAR LAS COLUMNAS CORRECTAS SEGÚN LA SEDE
        columns: getColumnsBySede(userSede),
        dom: '<"top"<"row"<"col-sm-12 col-md-6"l><"col-sm-12 col-md-6"f>>>rt<"bottom"<"row"<"col-sm-12 col-md-6"i><"col-sm-12 col-md-6"p>>><"clear">',
        language: {
            search: "Buscar:",
            lengthMenu: "Mostrar _MENU_ registros",
            info: "Mostrando _START_ a _END_ de _TOTAL_ registros",
            infoEmpty: "No hay registros disponibles",
            infoFiltered: "(filtrados de _MAX_ registros totales)",
            zeroRecords: "No se encontraron registros coincidentes",
            paginate: {
                first: "Primero",
                last: "Último",
                next: "Siguiente",
                previous: "Anterior"
            }
        },
        initComplete: function() {
            console.log("=== DATATABLE INICIALIZADA ===");
            console.log("Columnas configuradas para:", userSede);
            initDateFilters();
            initDropdownFilters();
            updateSummary(this.api());
            setupExportButton();
        },
        drawCallback: function(settings) {
            const api = this.api();
            updateSummary(api);
        }
    });

    // 5. Funciones de apoyo
    function processFilterData(data) {
        const estados = new Set();
        const entidades = new Set();

        data.forEach(item => {
            if (item.estado_caja) estados.add(item.estado_caja);
            if (item.entidad_remitente) entidades.add(item.entidad_remitente);
        });

        // Limpiar opciones anteriores
        $('#filterEstado option:not(:first)').remove();
        $('#filterEntidad option:not(:first)').remove();

        // Llenar dropdown de estados
        const $estadoFilter = $('#filterEstado');
        Array.from(estados).sort().forEach(estado => {
            $estadoFilter.append(`<option value="${estado}">${estado}</option>`);
        });

        // Llenar dropdown de entidades
        const $entidadFilter = $('#filterEntidad');
        Array.from(entidades).sort().forEach(entidad => {
            $entidadFilter.append(`<option value="${entidad}">${entidad}</option>`);
        });
    }

    function initDateFilters() {
        // Limpiar filtros de fecha anteriores
        $.fn.dataTable.ext.search = $.fn.dataTable.ext.search.filter(filter => {
            return !filter.toString().includes('fechaDoc');
        });

        $.fn.dataTable.ext.search.push(function(settings, data, dataIndex) {
            const fechaDesde = $('#fechaDesde').val();
            const fechaHasta = $('#fechaHasta').val();
            
            if (!fechaDesde && !fechaHasta) return true;
            
            const rowData = table.row(dataIndex).data();
            const fechaDoc = rowData.fecha_del_dato || rowData.fecha_transferencia;
            
            if (!fechaDoc) return !fechaDesde && !fechaHasta;
            
            const fecha = new Date(fechaDoc);
            if (fechaDesde && fecha < new Date(fechaDesde)) return false;
            if (fechaHasta && fecha > new Date(fechaHasta + 'T23:59:59')) return false;
            return true;
        });

        $('#fechaDesde, #fechaHasta').on('change', function() {
            table.draw();
        });
    }

    function initDropdownFilters() {
        // Limpiar filtros anteriores
        $.fn.dataTable.ext.search = $.fn.dataTable.ext.search.filter(filter => {
            return !filter.toString().includes('estadoFilter') && 
                   !filter.toString().includes('entidadFilter');
        });

        // Filtro por estado
        $.fn.dataTable.ext.search.push(function(settings, data, dataIndex) {
            const estadoFilter = $('#filterEstado').val();
            if (!estadoFilter) return true;
            
            const rowData = table.row(dataIndex).data();
            return rowData.estado_caja === estadoFilter;
        });

        // Filtro por entidad remitente
        $.fn.dataTable.ext.search.push(function(settings, data, dataIndex) {
            const entidadFilter = $('#filterEntidad').val();
            if (!entidadFilter) return true;
            
            const rowData = table.row(dataIndex).data();
            return rowData.entidad_remitente === entidadFilter;
        });

        $('#filterEstado, #filterEntidad').on('change', function() {
            table.draw();
        });
    }

    function updateSummary(tableApi) {
        const data = tableApi.rows({ search: 'applied' }).data();
        
        const cajasUnicas = new Set();
        const cajasFinalizadas = new Set();
        const cajasEnProceso = new Set();
        
        let cajaMin = null;
        let cajaMax = null;
        let updMin = null;
        let updMax = null;

        data.each(function(row) {
            // Procesar caja
            if (row.caja) {
                const caja = row.caja.toString().trim();
                if (caja) {
                    cajasUnicas.add(caja);
                    
                    cajaMin = cajaMin === null ? caja : (caja < cajaMin ? caja : cajaMin);
                    cajaMax = cajaMax === null ? caja : (caja > cajaMax ? caja : cajaMax);
                    
                    if (row.estado_caja) {
                        const estado = row.estado_caja.toUpperCase();
                        if (estado.includes('FINALIZADO')) {
                            cajasFinalizadas.add(caja);
                        } else if (estado.includes('PROCESO')) {
                            cajasEnProceso.add(caja);
                        }
                    }
                }
            }

            // Procesar upd
            if (row.upd) {
                const upd = row.upd.toString().trim();
                if (upd) {
                    updMin = updMin === null ? upd : (upd < updMin ? upd : updMin);
                    updMax = updMax === null ? upd : (upd > updMax ? upd : updMax);
                }
            }
        });

        // Actualizar campos del formulario si existen
        if ($('#cajaInicio').length) $('#cajaInicio').val(cajaMin || '');
        if ($('#cajaFin').length) $('#cajaFin').val(cajaMax || '');
        if ($('#updInicio').length) $('#updInicio').val(updMin || '');
        if ($('#updFin').length) $('#updFin').val(updMax || '');
        if ($('#registro').length) $('#registro').val(data.length);
        if ($('#cajatotal').length) $('#cajatotal').val(cajasUnicas.size);
        if ($('#Caja_Finalizada').length) $('#Caja_Finalizada').val(cajasFinalizadas.size);
        if ($('#Caja_Proceso').length) $('#Caja_Proceso').val(cajasEnProceso.size);
    }

    function setupExportButton() {
        $('#btnExport').on('click', function() {
            // Crear botón de exportación si no existe
            if (!table.buttons) {
                new $.fn.dataTable.Buttons(table, {
                    buttons: [{
                        extend: 'excelHtml5',
                        text: '<i class="fas fa-file-excel"></i> Excel',
                        title: `Registros_${producer.replace(/[^a-zA-Z0-9]/g, '_')}`,
                        messageTop: [
                            `Registros elaborados por: ${producer}`,
                            `Sede: ${userSede}`,
                            `Filtros aplicados:`,
                            `- Estado: ${$('#filterEstado').val() || 'Todos'}`,
                            `- Entidad: ${$('#filterEntidad').val() || 'Todas'}`,
                            `- Fecha desde: ${$('#fechaDesde').val() || 'N/A'}`,
                            `- Fecha hasta: ${$('#fechaHasta').val() || 'N/A'}`,
                            `Total registros: ${$('#record-count').text()}`,
                            `Generado el: ${new Date().toLocaleString()}`
                        ].join('\n'),
                        exportOptions: {
                            columns: ':visible',
                            modifier: {
                                search: 'applied',
                                order: 'applied'
                            }
                        }
                    }]
                });
            }
            table.button('.buttons-excel').trigger();
        });
    }

        // Limpiar localStorage al salir de la página
        $(window).on('beforeunload', function() {
            localStorage.removeItem('currentProducer');
        });

    }, 100); // Fin del setTimeout
