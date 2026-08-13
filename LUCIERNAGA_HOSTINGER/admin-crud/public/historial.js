$(document).ready(function() {
    // Inicializar DataTable con scroll horizontal
    $('#historialTable').DataTable({
        ajax: {
            url: 'http://200.100.20.66:3000/api/historial', 
            dataSrc: '' 
        },
        scrollX: true, 
        columns: [
            { data: 'id_historial' },
            { data: 'id_dato' },
            { data: 'fecha_del_dato' },
            { data: 'n_orden' },
            { data: 'codigo' },
            { data: 'entidad_remitente' },
            { data: 'entidad_productora' },
            { data: 'unidad_administrativa' },
            { data: 'oficina_productora' },
            { data: 'objeto' },
            { data: 'serie' },
            { data: 'subserie' },
            { data: 'asunto' },
            { data: 'radicado' },
            { data: 'numero_doc' },
            { data: 'numero_doc_hasta' },
            { data: 'fecha_inicial' },
            { data: 'fecha_final' },
            { data: 'caja' },
            { data: 'upd' },
            { data: 'tomo' },
            { data: 'otro' },
            { data: 'caja_interna' },
            { data: 'folios' },
            { data: 'soporte' },
            { data: 'frecuencia' },
            { data: 'elaborado_por' },
            { data: 'nro_acta_transferible' },
            { data: 'fecha_transferencia' },
            { data: 'notas' },
            { data: 'sede' },
            { data: 'tipo_cambio' },
            { data: 'fecha_cambio' },
            { data: 'tiempo' },
            { data: 'historial_cambios' },
            { data: 'cambio_calidad' },
            { data: 'sede_calidad' }
            
        ]
    });
});
