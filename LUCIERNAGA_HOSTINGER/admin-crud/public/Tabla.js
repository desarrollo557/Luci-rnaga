let currentUserSede = "";

async function getUserSede() {
    try {
        const response = await fetch('/currentUser');
        if (response.ok) {
            const data = await response.json();
            return data.sede || "OTRA SEDE";
        }
    } catch (err) {
        console.error("Error obteniendo sede:", err);
    }
    return "OTRA SEDE";
}

function getOrderedColumns() {
    const isSantaMarta = currentUserSede === "SANTA MARTA-PROYECTO";

    // Todas las columnas base (ordenadas según JSON real)
    const allColumns = [
        {
            data: 'id',
            title: '<input type="checkbox" id="selectAll">',
            orderable: false,
            render: function (data) {
                return `<input type="checkbox" class="row-checkbox" data-id="${data}">`;
            }
        },
        { data: "id", title: "ID", visible: false },
        { data: "n_orden", title: "NUMERO DE ORDEN" },
        { data: "codigo", title: "CODIGO" },
        { data: "entidad_remitente", title: "ENTIDAD REMITENTE" },
        { data: "entidad_productora", title: "ENTIDAD PRODUCTORA" },
        { data: "unidad_administrativa", title: "UNIDAD ADMINISTRATIVA" },
        { data: "oficina_productora", title: "OFICINA PRODUCTORA" },
        { data: "objeto", title: "OBJETO" },
        { data: "serie", title: "SERIE" },
        { data: "subserie", title: "SUBSERIE" },
        { data: "numero_de_orden_interno", title: "NUMERO DE ORDEN INTERNO" },
        { data: "accionado_procesado", title: "ACCIONADO PROCESADO" },
        { data: "accionado_denunciante", title: "ACCIONADO DENUNCIANTE" },
        { data: "identificacion", title: "IDENTIFICACION" },
        { data: "asunto", title: "ASUNTO" },
        { data: "radicado", title: "RADICADO" },
        { data: "numero_doc", title: "NUMERO DOCUMENTO DESDE" },
        { data: "numero_doc_hasta", title: "NUMERO DE DOCUMENTO HASTA" },
        {
            data: "fecha_inicial",
            title: "FECHA INICIAL",
            render: (d) => d ? d.substring(0, 10) : ''
        },
        {
            data: "fecha_final",
            title: "FECHA FINAL",
            render: (d) => d ? d.substring(0, 10) : ''
        },
        { data: "caja", title: "CAJA" },
        { data: "upd", title: "UPD" },
        { data: "tomo", title: "TOMO" },
        { data: "otro", title: "OTRO" },
        { data: "caja_interna", title: "CAJA INTERNA" },
        { data: "folios", title: "FOLIOS" },
        { data: "soporte", title: "SOPORTE" },
        { data: "frecuencia", title: "FRECUENCIA" },
        { data: "elaborado_por", title: "ELABORADO POR" },
        {
            data: "fecha_del_dato",
            title: "FECHA DE INVENTARIO",
            render: (d) => d ? d.substring(0, 10) : ''
        },
        { data: "nro_acta_transferible", title: "NUMERO ACTA DE TRANSFERIBLE" },
        {
            data: "fecha_transferencia",
            title: "FECHA DE TRANSFERENCIA",
            render: (d) => d ? d.substring(0, 10) : ''
        },
        { data: "notas", title: "NOTAS" },   
        {
            data: null,
            title: "ACCIONES",
            defaultContent: '<button class="editBtn">Editar</button> <button class="deleteBtn">Eliminar</button>',
            orderable: false
        },
        { data: "sede", title: "SEDE" },
        { data: "tiempo", title: "TIEMPO" },
        { data: "historial_y_cambios", title: "CAMBIOS" },
        { data: "cambio_calidad", title: "ELABORADO/CALIDAD" },
        { data: "sede_calidad", title: "SEDE/CALIDAD" },
        { data: "asunto_2", title: "ASUNTO AUTOMATICO" },
        { data: "asunto_3", title: "ASUNTO MANUAL" }
    ];

      if (isSantaMarta) {
        return [
            allColumns[0],  // Checkbox
            allColumns[1],  // ID oculto
            allColumns[2],  // n_orden
            allColumns[3],  // codigo
            allColumns[4],  // entidad_remitente
            allColumns[5],  // entidad_productora
            allColumns[6],  // unidad_administrativa
            allColumns[7],  // oficina_productora
            allColumns[8],  // objeto
            allColumns[11], // numero_de_orden_interno
            allColumns[12], // accionado_procesado
            allColumns[13], // accionado_denunciante
            allColumns[14], // identificacion
            allColumns[16], // radicado
            { ...allColumns[17], title: "INICIAL" },
            { ...allColumns[18], title: "FINAL" },
            allColumns[21], // caja
            allColumns[22], // upd
            allColumns[23], // tomo
            allColumns[24], // otro
            allColumns[25], // caja_interna
            allColumns[26], // folios
            allColumns[27], // soporte
            allColumns[28], // frecuencia
            { ...allColumns[29], title: "OBSERVACIONES" }, 
            allColumns[30], // elaborado_por
            allColumns[31], // nro_acta_transferible
            allColumns[32], // fecha_transferencia
            allColumns[33], // notas
            allColumns[34], // acciones
            allColumns[35], // sede
            allColumns[36], // tiempo
            allColumns[37], // historial_y_cambios
            allColumns[38], // cambio_calidad
            allColumns[39], // sede_calidad
            allColumns[40], // asunto_2
            allColumns[41]  // asunto_3
        ];
    } else {
        return [
            allColumns[0],  // Checkbox
            allColumns[1],  // ID oculto
            allColumns[2],  // n_orden
            allColumns[3],  // codigo
            allColumns[4],  // entidad_remitente
            allColumns[5],  // entidad_productora
            allColumns[6],  // unidad_administrativa
            allColumns[7],  // oficina_productora
            allColumns[8],  // objeto
            allColumns[9],  // serie
            allColumns[10], // subserie
            allColumns[15], // asunto
            allColumns[17], // numero_doc
            allColumns[18], // numero_doc_hasta
            allColumns[19], // fecha_inicial
            allColumns[20], // fecha_final
            allColumns[21], // caja
            allColumns[22], // upd
            allColumns[23], // tomo
            allColumns[24], // otro
            allColumns[25], // caja_interna
            allColumns[26], // folios
            allColumns[27], // soporte
            allColumns[28], // frecuencia
            allColumns[29], // elaborado_por
            allColumns[30], // fecha_del_dato
            allColumns[31], // nro_acta_transferible
            allColumns[32], // fecha_transferencia
            allColumns[33], // notas
            allColumns[34], // acciones
            allColumns[35], // sede
            allColumns[36], // tiempo
            allColumns[37], // historial_y_cambios
            allColumns[38], // cambio_calidad
            allColumns[39], // sede_calidad
            allColumns[40], // asunto_2
            allColumns[41]  // asunto_3
        ];
    }
}


function getExportColumns() {
    const isSantaMarta = currentUserSede === "SANTA MARTA-PROYECTO";
    
    if (isSantaMarta) {
        return [
            0, 1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 13, 14, 16, 17, 18, 
            21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 
            35, 36, 37, 38, 39, 40, 41
        ];
    } else {
        return [
            0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 17, 18, 19, 20, 
            21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 
            35, 36, 37, 38, 39, 40, 41
        ];
    }
}

// Función auxiliar para formatear datos
function formatExportData(data, row, column, node) {
    const colIndex = $(node).index();
    
    const fechaColumnsSantaMarta = [17, 18, 30, 32];
    const fechaColumnsOtraSede = [19, 20, 30, 32];
    
    const isSantaMarta = currentUserSede === "SANTA MARTA-PROYECTO";
    const fechaColumns = isSantaMarta ? fechaColumnsSantaMarta : fechaColumnsOtraSede;
    
    if (fechaColumns.includes(colIndex) && typeof data === 'string') {
        return data.substring(0, 10);
    }
    
    return data || '';
}

let table;

$(document).ready(async function() {
    try {
        // OBTENER LA SEDE ANTES DE INICIALIZAR
        currentUserSede = await getUserSede();
        console.log("Sede del usuario:", currentUserSede);
        
        table = $('#dataTable').DataTable({
        fixedColumns: { start: 2 },
        deferRender: true,
        buttons: [{ extend: 'pageLength', className: 'btn-modern' }],
        scrollY: "600px",
        scrollX: true,
        scroller: false,
        paging: true,
        processing:true,
        pageLength: 15,
        lengthMenu: [15, 30, 50, 70, 100, 150, 200],
        lengthChange: true,
        pagingType: "full_numbers",
       ajax: {
            url: "http://200.100.20.66:3000/fuiddatosreal",
            dataSrc: function(data) {
                if (data.length > 0) {
                }
                return data;
            }
                },
        columns: getOrderedColumns(),
        language: {
            processing: '<div class="spinner"></div> Cargando datos...',
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
            dom: 'Bfrtip',
            buttons: [
                {
                        extend: 'excelHtml5',
                        text: 'Descargar Reporte',
                        title: 'Reporte FUID',
                        filename: function() {
                            const fileName = prompt("Ingrese el nombre del archivo Excel:");
                            return fileName ? fileName : 'Reporte_FUID';
                        },
                        exportOptions: {
                            columns: getExportColumns,
                            format: {
                                body: formatExportData
                            }
                        }
                    },
                {
                    text: 'Planilla Inventario',
                    extend: 'excelHtml5',
                    action: function (e, dt, node, config) {
                        const fileName = prompt("Ingrese el nombre del archivo Excel:");
                        if (!fileName) return;
                
                        const filtroCaja = localStorage.getItem('caja');
                        const filtroTecnicaReal = JSON.parse(localStorage.getItem('filtroTecnicaReal'));
                        const elaboradoPor = $('#elaborado_por_filter').val();
                
                        const filtros = {
                            caja: filtroCaja,
                            entidad_remitente: filtroTecnicaReal ? filtroTecnicaReal.entidad_remitente : null,
                            elaborado_por: elaboradoPor
                        };
                
                        const rows = dt.rows({ filter: 'applied' }).data();
                
                        let registrosAgrupadosPorFechaYDigitador = {};
                        let cajasGlobales = new Set();
                
                        rows.each(function (row) {
                            const fechaDelDato = row.fecha_del_dato;
                            const caja = row.caja;
                            const upd = row.upd;
                            const digitador = row.elaborado_por;
                
                            if (!registrosAgrupadosPorFechaYDigitador[fechaDelDato]) {
                                registrosAgrupadosPorFechaYDigitador[fechaDelDato] = {};
                            }
                
                            if (!registrosAgrupadosPorFechaYDigitador[fechaDelDato][digitador]) {
                                registrosAgrupadosPorFechaYDigitador[fechaDelDato][digitador] = {
                                    fecha_del_dato: fechaDelDato,
                                    codigoCliente: caja.slice(0, 3),
                                    cajaInicio: caja,
                                    cajaFin: caja,
                                    updInicio: upd,
                                    updFin: upd,
                                    totalRegistros: 0,
                                    cajasUnicas: new Set(),
                                    digitador: digitador
                                };
                            }
                
                            let fechaData = registrosAgrupadosPorFechaYDigitador[fechaDelDato][digitador];
                
                            if (caja < fechaData.cajaInicio) {
                                fechaData.cajaInicio = caja;
                            }
                            if (caja > fechaData.cajaFin) {
                                fechaData.cajaFin = caja;
                            }
                            if (upd < fechaData.updInicio) {
                                fechaData.updInicio = upd;
                            }
                            if (upd > fechaData.updFin) {
                                fechaData.updFin = upd;
                            }
                
                            if (!cajasGlobales.has(caja)) {
                                fechaData.cajasUnicas.add(caja);
                                cajasGlobales.add(caja);
                            }
                
                            fechaData.totalRegistros++;
                        });
                
                        const exportData = [];
                        Object.values(registrosAgrupadosPorFechaYDigitador).forEach(fechaData => {
                            Object.values(fechaData).forEach(registro => {
                                let fecha = new Date(registro.fecha_del_dato);
                                fecha.setUTCHours(23, 59, 59, 999);
                
                                let formattedFecha = `${("0" + fecha.getDate()).slice(-2)}/${("0" + (fecha.getMonth() + 1)).slice(-2)}/${fecha.getFullYear()}`;
                
                                exportData.push([
                                    fecha,
                                    registro.codigoCliente,
                                    registro.cajaInicio,
                                    registro.cajaFin,
                                    registro.cajasUnicas.size,
                                    registro.updInicio,
                                    registro.updFin,
                                    registro.totalRegistros,
                                    registro.digitador
                                ]);
                            });
                        });
                
                        const wb = XLSX.utils.book_new();
                        const ws = XLSX.utils.aoa_to_sheet([
                            ['Fecha', 'Código Cliente', '#CAJA_INI SIAR', '#CAJ_FIN SIAR', 'TOT_CAJ SIAR', 'UPD_INI', 'UPD_FIN', 'TOTAL_REGISTROS', 'DIGITADOR']
                        ].concat(exportData));
                
                        XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
                
                        const wscols = [
                            { wch: 10 },
                            { wch: 15 },
                            { wch: 15 },
                            { wch: 15 },
                            { wch: 15 },
                            { wch: 15 },
                            { wch: 15 },
                            { wch: 15 },
                            { wch: 20 }
                        ];
                
                        ws['!cols'] = wscols;
                
                        XLSX.writeFile(wb, fileName + '.xlsx');
                    }
                },
                {
                    text: 'Plantilla General',
                    action: function() {
                        const fileName = prompt("Ingrese el nombre del archivo Excel:");
                        if (!fileName) return;
            
                        const filtroCaja = localStorage.getItem('caja');
                        const filtroTecnicaReal = JSON.parse(localStorage.getItem('filtroTecnicaReal'));
                        const elaboradoPor = $('#elaborado_por_filter').val();
                    
                        const filtros = {
                            caja: filtroCaja,
                            entidad_remitente: filtroTecnicaReal ? filtroTecnicaReal.entidad_remitente : null,
                            elaborado_por: elaboradoPor
                        };
             
                        $.ajax({
                            url: 'http://200.100.20.66:3000/generarPlantilla',
                            method: 'POST',
                            contentType: 'application/json',
                            data: JSON.stringify({
                                fileName: fileName,
                                filtros: filtros
                            }),
                            success: function(response) {
                                const link = document.createElement('a');
                                link.href = response.fileUrl;
                                link.download = fileName + '.xlsx';
                                link.click();
                            },
                            error: function(xhr) {
                                Swal.fire('Error', 'No se pudo generar el archivo.', 'error');
                            }
                        });
                    }
                }
            ],
            initComplete: function() {
                console.log("DataTable inicializado para sede:", currentUserSede);
                
                const filtroCaja = localStorage.getItem('caja');
                const filtroTecnicaReal = JSON.parse(localStorage.getItem('filtroTecnicaReal'));
                const origen = localStorage.getItem('origen');
                
                if (origen === 'modulo_caja' && filtroCaja) {
                    table.columns().every(function() {
                        if (this.dataSrc() === 'caja') {
                            this.search(filtroCaja).draw();
                        }
                    });
                } else if (origen === 'TecnicaReal' && filtroTecnicaReal) {
                    const { entidad_remitente } = filtroTecnicaReal;
                    table.columns().every(function() {
                        if (this.dataSrc() === 'entidad_remitente') {
                            this.search(entidad_remitente).draw();
                        }
                    });
                }
            
                const filterContainer = $('#dataTable_filter');
            
                const filterLabel = $('<span>Fecha de inventario Desde: </span>').css('margin-right', '5px');
                const desdeInput = $('<input type="date" id="fecha_desde_filter" class="form-control form-control-sm" placeholder="Desde">').css('margin-right', '10px');
                const hastaLabel = $('<span>Hasta: </span>').css('margin-right', '5px');
                const hastaInput = $('<input type="date" id="fecha_hasta_filter" class="form-control form-control-sm" placeholder="Hasta">').css('margin-right', '10px');
                
                const elaboradoLabel = $('<span>Elaborado por: </span>').css('margin-left', '10px').css('margin-right', '5px');
                const elaboradoSelect = $('<select id="elaborado_por_filter" class="form-control form-control-sm"></select>').css('margin-right', '10px');
                elaboradoSelect.append('<option value="">Todos</option>');
                
                table.columns().every(function() {
                    if (this.dataSrc() === 'elaborado_por') {
                        this.data().unique().sort().each(function(d) {
                            if (d && d.trim() !== '') {
                                elaboradoSelect.append(`<option value="${d}">${d}</option>`);
                            }
                        });
                    }
                });
                
                filterContainer.prepend(elaboradoSelect);
                filterContainer.prepend(elaboradoLabel);
                filterContainer.prepend(hastaInput);
                filterContainer.prepend(hastaLabel);
                filterContainer.prepend(desdeInput);
                filterContainer.prepend(filterLabel);
                
                $.fn.dataTable.ext.search.push(function(settings, data, dataIndex) {
                    const desde = $('#fecha_desde_filter').val();
                    const hasta = $('#fecha_hasta_filter').val();
                    const elaborado = $('#elaborado_por_filter').val();
                    const fecha = data[settings.aoColumns.findIndex(col => col.data === 'fecha_del_dato')];
                    const elaboradoPor = data[settings.aoColumns.findIndex(col => col.data === 'elaborado_por')];
                
                    if (desde || hasta) {
                        const fechaDate = new Date(fecha);
                        const desdeDate = desde ? new Date(desde) : null;
                        const hastaDate = hasta ? new Date(hasta) : null;
                
                        if (desdeDate && fechaDate < desdeDate) return false;
                        if (hastaDate && fechaDate > hastaDate) return false;
                    }
                
                    if (elaborado && elaborado !== elaboradoPor) {
                        return false;
                    }
                
                    return true;
                });
                
                $('#fecha_desde_filter, #fecha_hasta_filter, #elaborado_por_filter').on('change', function() {
                    table.draw();
                });
            
                actualizarCamposFormulario(table);
            }
        });

        // Mover estos event listeners fuera de la configuración de DataTable
        table.on('search.dt', function () {
            actualizarCamposFormulario(table);
        });

        // Edición de filas
        $('#dataTable').on('click', '.editBtn', function() {
             const data = table.row($(this).closest('tr')).data();
    if (!data) return;

    // Obtener datos del usuario actual
    fetch('http://200.100.20.66:3000/currentUser')
        .then(response => {
            if (!response.ok) throw new Error('Error de autenticación o acceso al endpoint');
            return response.json();
        })
        .then(userData => {
            if (userData.nombre && userData.cc) {
                $('#editcambio_calidad').val(`${userData.nombre} (${userData.cc})`);
            }
            if (userData.sede) {
                $('#editsede_calidad').val(userData.sede);
            }
        })
        .catch(error => console.error('Error al obtener datos del usuario:', error));

    // Rellenar el formulario con los datos de la fila
    $('#editId').val(data.id);
    $('#editFechaDelDato').val(data.fecha_del_dato ? data.fecha_del_dato.substring(0, 10) : '');
    $('#editNOrden').val(data.n_orden);
    $('#editCodigo').val(data.codigo);
    $('#editEntidadRemitente').val(data.entidad_remitente);
    $('#editEntidadProductora').val(data.entidad_productora);
    $('#editUnidadAdministrativa').val(data.unidad_administrativa);
    $('#editOficinaProductora').val(data.oficina_productora);
    $('#editObjeto').val(data.objeto);
    $('#editSerie').val(data.serie);
    $('#editSubserie').val(data.subserie);
    $('#editnumero_de_orden_interno').val(data.numero_de_orden_interno);
    $('#editaccionado_procesado').val(data.accionado_procesado);
    $('#editaccionado_denunciante').val(data.accionado_denunciante);   
    $('#editidentificacion').val(data.identificacion);
    $('#editAsunto').val(data.asunto);
    $('#editAsunto2').val(data.asunto_2);
    $('#editAsunto3').val(data.asunto_3);
    $('#editradicado').val(data.radicado || 'N/A'); 
    $('#editNumeroDoc').val(data.numero_doc);
    $('#editNumeroDocHasta').val(data.numero_doc_hasta);
    $('#editFechaInicial').val(data.fecha_inicial ? data.fecha_inicial.substring(0, 10) : '');
    $('#editFechaFinal').val(data.fecha_final ? data.fecha_final.substring(0, 10) : '');
    $('#editCaja').val(data.caja);
    $('#editUpd').val(data.upd);
    $('#editTomo').val(data.tomo);
    $('#editOtro').val(data.otro);
    $('#editCajaInterna').val(data.caja_interna);
    $('#editFolios').val(data.folios);
    $('#editSoporte').val(data.soporte);
    $('#editFrecuencia').val(data.frecuencia);
    $('#editElaboradoPor').val(data.elaborado_por);
    $('#editNroActaTransferible').val(data.nro_acta_transferible);
    $('#editFechaTransferencia').val(data.fecha_transferencia ? data.fecha_transferencia.substring(0, 10) : '');
    $('#editNotas').val(data.notas);
    $('#editsede').val(data.sede);
    $('#edittiempo').val(data.tiempo);
    $('#edithistorial_y_cambios').val(data.historial_y_cambios);
    $('#editcambio_calidad').val(data.cambio_calidad);
    $('#editsede_calidad').val(data.sede_calidad);

    // Mostrar el formulario de edición
    $('#editForm').show();

    // Guardar valores iniciales para historial
    valoresIniciales = {};
    $('#editForm input').each(function() {
        valoresIniciales[$(this).attr('id')] = $(this).val();
    });
}); 
// Actualizar historial de cambios al editar cualquier campo
$('#editForm input').on('blur', function() {
    const campoId = $(this).attr('id');
    const campoNombre = $(this).attr('placeholder') || campoId;
    const valorInicial = valoresIniciales[campoId];
    const valorNuevo = $(this).val();

    if (valorInicial !== valorNuevo) {
        const cambio = `${campoNombre}[${valorInicial}]  >>> ${campoNombre}:[${valorNuevo}]`;
        const historial = $('#edithistorial_y_cambios').val();
        $('#edithistorial_y_cambios').val(historial ? historial + ", " + cambio : cambio);
        valoresIniciales[campoId] = valorNuevo;
    }
});

// Enviar datos actualizados al servidor
$('#editForm').on('submit', function(e) {
    e.preventDefault();
    const id = $('#editId').val();
    const updatedData = {
        fecha_del_dato: $('#editFechaDelDato').val(),
        n_orden: $('#editNOrden').val(),
        codigo: $('#editCodigo').val(),
        entidad_remitente: $('#editEntidadRemitente').val(),
        entidad_productora: $('#editEntidadProductora').val(),
        unidad_administrativa: $('#editUnidadAdministrativa').val(),
        oficina_productora: $('#editOficinaProductora').val(),
        objeto: $('#editObjeto').val(),
        serie: $('#editSerie').val(),
        subserie: $('#editSubserie').val(),
        numero_de_orden_interno: $('#editnumero_de_orden_interno').val(),
        accionado_procesado: $('#editaccionado_procesado').val(),
        accionado_denunciante: $('#editaccionado_denunciante').val(),
        identificacion: $('#editidentificacion').val(),
        asunto: $('#editAsunto').val(),
        asunto_2: $('#editAsunto2').val(),
        asunto_3: $('#editAsunto3').val(),
        radicado: $('#editradicado').val() || '',
        numero_doc: $('#editNumeroDoc').val(),
        numero_doc_hasta: $('#editNumeroDocHasta').val(),
        fecha_inicial: $('#editFechaInicial').val(),
        fecha_final: $('#editFechaFinal').val(),
        caja: $('#editCaja').val(),
        upd: $('#editUpd').val(),
        tomo: $('#editTomo').val(),
        otro: $('#editOtro').val(),
        caja_interna: $('#editCajaInterna').val(),
        folios: $('#editFolios').val(),
        soporte: $('#editSoporte').val(),
        frecuencia: $('#editFrecuencia').val(),
        elaborado_por: $('#editElaboradoPor').val(),
        nro_acta_transferible: $('#editNroActaTransferible').val(),
        fecha_transferencia: $('#editFechaTransferencia').val(),
        sede: $('#editsede').val(),
        tiempo: $('#edittiempo').val(),
        historial_y_cambios: $('#edithistorial_y_cambios').val(),
        cambio_calidad: $('#editcambio_calidad').val(),
        sede_calidad: $('#editsede_calidad').val(),
        notas: $('#editNotas').val()
    };

    $.ajax({
        url: `http://200.100.20.66:3000/fuiddatosreal/${id}`,
        method: 'PUT',
        contentType: 'application/json',
        data: JSON.stringify(updatedData),
        success: function() {
            Swal.fire('Actualizado!', 'El registro ha sido actualizado.', 'success');
            table.ajax.reload();
            $('#editForm').hide();
        },
        error: function(xhr) {
            Swal.fire('Error!', xhr.responseJSON?.error || 'Error desconocido', 'error');
        }
    });
});

// ------------------------
// ELIMINAR FILA
// ------------------------
$(document).on('click', '.deleteBtn', function() {
    const data = table.row($(this).closest('tr')).data();
    if (!data) return;
    const id = data.id;

    Swal.fire({
        title: '¿Estás seguro?',
        text: "¡No podrás recuperar este registro!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Sí, eliminarlo!'
    }).then((result) => {
        if (result.isConfirmed) {
            $.ajax({
                url: `http://200.100.20.66:3000/fuiddatosreal/${id}`,
                method: 'DELETE',
                success: function() {
                    Swal.fire('Eliminado!', 'El registro ha sido eliminado.', 'success');
                    table.ajax.reload();
                },
                error: function(xhr) {
                    Swal.fire('Error!', xhr.responseJSON?.error || 'Error desconocido', 'error');
                }
            });
        }
    });
});


        // Eliminación de filas
        $('#dataTable').on('click', '.deleteBtn', function() {
        

            const id = table.row($(this).parents('tr')).data().id;

            Swal.fire({
                title: '¿Estás seguro?',
                text: "¡No podrás recuperar este registro!",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#3085d6',
                cancelButtonColor: '#d33',
                confirmButtonText: 'Sí, eliminarlo!'
            }).then((result) => {
                if (result.isConfirmed) {
                    $.ajax({
                        url: `http://200.100.20.66:3000/fuiddatosreal/${id}`,
                        method: 'DELETE',
                        success: function(response) {
                            Swal.fire('Eliminado!', 'El registro ha sido eliminado.', 'success');
                            table.ajax.reload();
                        },
                        error: function(xhr) {
                            Swal.fire('Error!', xhr.responseJSON.error, 'error');
                        }
                    });
                }
            });
        


        });

    } catch (error) {
        console.error("Error al inicializar DataTable:", error);
    }
});

// Resto de funciones (actualizarCamposFormulario, etc.) fuera del document ready




// Función para actualizar los campos del formulario con los datos de la tabla
function actualizarCamposFormulario(table) {
    // Obtener los datos de las filas visibles después de aplicar el filtro
    const rows = table.rows({ filter: 'applied' }).data();
    
    // Inicializar variables para los valores que vamos a obtener
    let cajaInicio = null;
    let cajaFin = null;
    let updInicio = null;
    let updFin = null;
    let totalRegistros = 0;  
    let cajasUnicas = new Set();  

    // Iterar sobre las filas visibles y obtener los valores
    rows.each(function(row) {
        const caja = row.caja; 
        const upd = row.upd;   

        // Determinar el valor mínimo para cajaInicio
        if (cajaInicio === null || caja < cajaInicio) {
            cajaInicio = caja;
        }
        // Determinar el valor máximo para cajaFin
        if (cajaFin === null || caja > cajaFin) {
            cajaFin = caja;
        }

        // Determinar el valor mínimo para updInicio
        if (updInicio === null || upd < updInicio) {
            updInicio = upd;
        }
        // Determinar el valor máximo para updFin
        if (updFin === null || upd > updFin) {
            updFin = upd;
        }

        cajasUnicas.add(caja); 
        totalRegistros++; // Contar el número total de registros
    });

    // Asignar los valores a los campos del formulario
    $('#cajaInicio').val(cajaInicio !== null ? cajaInicio : '');
    $('#cajaFin').val(cajaFin !== null ? cajaFin : '');
    $('#updInicio').val(updInicio !== null ? updInicio : '');
    $('#updFin').val(updFin !== null ? updFin : '');
    $('#registro').val(totalRegistros);  
    $('#cajatotal').val(cajasUnicas.size); 
}



// Enviar los datos actualizados
$('#editForm').on('submit', function(e) {
    e.preventDefault();
    const id = $('#editId').val();
    const updatedData = {
        fecha_del_dato: $('#editFechaDelDato').val(),
        n_orden: $('#editNOrden').val(),
        codigo: $('#editCodigo').val(),
        entidad_remitente: $('#editEntidadRemitente').val(),
        entidad_productora: $('#editEntidadProductora').val(),
        unidad_administrativa: $('#editUnidadAdministrativa').val(),
        oficina_productora: $('#editOficinaProductora').val(),
        objeto: $('#editObjeto').val(),
        serie: $('#editSerie').val(),
        subserie: $('#editSubserie').val(),
        numero_de_orden_interno: $('#editnumero_de_orden_interno').val(),
        accionado_procesado: $('#editaccionado_procesado').val(),
        accionado_denunciante: $('#editaccionado_denunciante').val(),
        identificacion: $('#editidentificacion').val(),
        asunto: $('#editAsunto').val(),
        asunto_2: $('#editAsunto2').val(),
        asunto_3: $('#editAsunto3').val(),
        radicado: $('#editradicado').val() || '',
        numero_doc: $('#editNumeroDoc').val(),
        numero_doc_hasta: $('#editNumeroDocHasta').val(),
        fecha_inicial: $('#editFechaInicial').val(),
        fecha_final: $('#editFechaFinal').val(),
        caja: $('#editCaja').val(),
        upd: $('#editUpd').val(),
        tomo: $('#editTomo').val(),
        otro: $('#editOtro').val(),
        caja_interna: $('#editCajaInterna').val(),
        folios: $('#editFolios').val(),
        soporte: $('#editSoporte').val(),
        frecuencia: $('#editFrecuencia').val(),
        elaborado_por: $('#editElaboradoPor').val(),
        nro_acta_transferible: $('#editNroActaTransferible').val(),
        fecha_transferencia: $('#editFechaTransferencia').val(),
        sede: $('#editsede').val(),
        tiempo: $('#edittiempo').val(),
        historial_y_cambios: $('#edithistorial_y_cambios').val(),
        cambio_calidad: $('#editcambio_calidad').val(),
        sede_calidad: $('#editsede_calidad').val(),
        notas: $('#editNotas').val()
    };

    $.ajax({
        url: `http://200.100.20.66:3000/fuiddatosreal/${id}`,
        method: 'PUT',
        contentType: 'application/json',
        data: JSON.stringify(updatedData),
        success: function(response) {
            Swal.fire('Actualizado!', 'El registro ha sido actualizado.', 'success');
            table.ajax.reload();
        },
        error: function(xhr) {
            Swal.fire('Error!', xhr.responseJSON.error, 'error');
        }
    });
});





// Agregar el checkbox en la cabecera
$('#dataTable thead tr').prepend('<th><input type="checkbox" id="selectAll"></th>');

let selectedIdsSet = new Set();
let lastChecked = null;

// Función para marcar o desmarcar todos los registros
$('#selectAll').on('click', function () {
    let checked = this.checked;
    $('.row-checkbox').each(function () {
        const id = $(this).data('id');
        $(this).prop('checked', checked);
        if (checked) {
            selectedIdsSet.add(id);
        } else {
            selectedIdsSet.delete(id);
        }
    });
    toggleOkButton();
});

// Función para mostrar u ocultar el botón OK
function toggleOkButton() {
    const selectedCount = selectedIdsSet.size;
    if (selectedCount > 0) {
        if ($('#btnOk').length === 0) {
            $('body').append(`
                <button id="btnOk" style="position: fixed; bottom: 20px; right: 20px; padding: 10px 20px; 
                background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; 
                box-shadow: 0 2px 5px rgba(0,0,0,0.2); z-index: 1000;">
                    <i class="fas fa-check"></i> OK (${selectedCount})
                </button>
            `);
        } else {
            $('#btnOk').html(`<i class="fas fa-check"></i> OK (${selectedCount})`);
        }
    } else {
        $('#btnOk').remove();
    }
}

// Función para gestionar la selección/deselección individual con SHIFT+Click
$(document).on('change', '.row-checkbox', function (e) {
    const id = $(this).data('id');
    const isChecked = this.checked;

    const checkboxes = $('.row-checkbox').toArray();

    if (e.shiftKey && lastChecked && lastChecked !== this) {
        const start = checkboxes.indexOf(lastChecked);
        const end = checkboxes.indexOf(this);
        if (start !== -1 && end !== -1) {
            const [from, to] = start < end ? [start, end] : [end, start];

            for (let i = from; i <= to; i++) {
                const cb = $(checkboxes[i]);
                const cbId = cb.data('id');
                cb.prop('checked', isChecked);
                if (isChecked) {
                    selectedIdsSet.add(cbId);
                } else {
                    selectedIdsSet.delete(cbId);
                }
            }
        }
    } else {
        if (isChecked) {
            selectedIdsSet.add(id);
        } else {
            selectedIdsSet.delete(id);
        }
    }

    lastChecked = this;
    toggleOkButton();
});

// Botón OK lógica
$(document).on('click', '#btnOk', async function () {
    const selectedIds = Array.from(selectedIdsSet);

    if (selectedIds.length === 0) {
        Swal.fire('Error', 'No hay registros seleccionados', 'warning');
        return;
    }

    try {
        const userResponse = await fetch('/currentUser');
        if (!userResponse.ok) throw new Error('Error al obtener datos del usuario');

        const currentUser = await userResponse.json();
        const nombreCompleto = `${currentUser.nombre}(${currentUser.cc})`;
        const sedeCalidad = currentUser.sede;

        const confirmResult = await Swal.fire({
            title: '¿Confirmar acción?',
            html: `Vas a marcar <b>${selectedIds.length} registros</b> como "OK" en el historial.<br><br>
                  <b>Usuario:</b> ${nombreCompleto}<br>
                  <b>Sede:</b> ${sedeCalidad}`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Sí, continuar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#28a745'
        });

        if (confirmResult.isConfirmed) {
            Swal.fire({
                title: 'Procesando...',
                html: 'Actualizando registros',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            });

            const response = await fetch('/fuiddatosreal/marcar-ok', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ids: selectedIds,
                    cambio_calidad: nombreCompleto,
                    sede_calidad: sedeCalidad
                })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Error al actualizar los registros');

            Swal.fire({
                title: '¡Éxito!',
                text: data.message || 'Registros actualizados correctamente',
                icon: 'success'
            });

            selectedIdsSet.clear();
            if (typeof table !== 'undefined' && typeof table.ajax.reload === 'function') {
                table.ajax.reload(null, false);
            }

            $('#btnOk').remove();
        }
    } catch (error) {
        Swal.fire({
            title: 'Error',
            text: error.message || 'Ocurrió un error inesperado',
            icon: 'error'
        });
    }
});

// Inserta checkboxes por fila cuando se dibuja la tabla
if (typeof table !== 'undefined') {
    table.on('draw.dt', function () {
        $('#dataTable tbody tr').each(function () {
            const id = table.row(this).data().id;

            if (!$(this).find('.row-checkbox').length) {
                $(this).find('td:first').before(
                    `<td><input type="checkbox" class="row-checkbox" data-id="${id}"></td>`
                );
            }

            if (selectedIdsSet.has(id)) {
                $(this).find('.row-checkbox').prop('checked', true);
            }
        });
        toggleOkButton();
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

function getExportColumns() {
    const isSantaMarta = currentUserSede === "SANTA MARTA-PROYECTO";

    if (isSantaMarta) {
        // ORDEN PARA SANTA MARTA-PROYECTO (se mantiene igual)
        return [
            3,  // codigo
            4,  // entidad_remitente
            5,  // entidad_productora
            6,  // unidad_administrativa
            7,  // oficina_productora
            8,  // objeto
            11, // numero_de_orden_interno
            12, // accionado_procesado
            16, // radicado
            17, // numero_doc (INICIAL)
            18, // numero_doc_hasta (FINAL)
            21, // caja
            22, // upd
            23, // tomo
            24, // otro
            25, // caja_interna
            26, // folios
            27, // soporte
            28, // frecuencia
            29, // notas (OBSERVACIONES)
            30, // elaborado_por
            31, // nro_acta_transferible
            32, // fecha_transferencia
            35, // sede
        ];
    } else {
        // ORDEN PARA OTRAS SEDES (sin campos que no deben existir)
        return [
            2,  // n_orden
            3,  // codigo
            4,  // entidad_remitente
            5,  // entidad_productora
            6,  // unidad_administrativa
            7,  // oficina_productora
            8,  // objeto
            9,  // serie
            10, // subserie
            15, // asunto
            20, // numero_doc
            21, // numero_doc_hasta
            22, // fecha_inicial
            23, // fecha_final
            24, // caja
            25, // upd
            26, // tomo
            27, // otro
            28, // caja_interna
            29, // folios
            30, // soporte
            31, // frecuencia
            32, // notas
            33, // elaborado_por
            34, // nro_acta_transferible
            35, // fecha_transferencia
            36  // sede
        ];
    }
}



// NOTA: Si necesitas campos que no están en tu configuración actual (como serie, subserie, etc.),
// debes agregarlos primero a tu DataTable y luego incluirlos en el array de exportación.

// Función alternativa si prefieres usar nombres de columnas en lugar de índices:
function getExportColumnsByName() {
    const isSantaMarta = currentUserSede === "SANTA MARTA-PROYECTO";
    
    if (isSantaMarta) {
        return [
            'codigo', 'entidad_remitente', 'entidad_productora', 'unidad_administrativa',
            'oficina_productora', 'objeto', 'numero_de_orden_interno', 'accionado_procesado',
            'accionado_denunciante', 'identificacion', 'radicado', 'numero_doc', 'numero_doc_hasta',
            'upd', 'tomo', 'otro', 'caja_interna', 'folios', 'soporte', 'frecuencia', 'notas'
        ];
    } else {
        return [
            'entidad_productora', 'unidad_administrativa', 'oficina_productora', 'objeto',
            'codigo', 'numero_doc', 'numero_doc_hasta', 'fecha_inicial', 'fecha_final',
            'upd', 'tomo', 'otro', 'caja_interna', 'folios', 'soporte', 'frecuencia', 'notas'
        ];
    }
}


