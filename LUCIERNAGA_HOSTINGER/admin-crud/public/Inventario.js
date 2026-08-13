document.addEventListener("DOMContentLoaded", function() {
    const addForm = document.getElementById("addForm");

    // Función para formatear la fecha quitando la hora (si viene en formato datetime)
    function formatDate(dateString) {
        if (dateString) {
            //Variable para las fechas.
            const date = new Date(dateString);
            const year = date.getFullYear();
            const month = (date.getMonth() + 1).toString().padStart(2, '0'); 
            const day = date.getDate().toString().padStart(2, '0'); 
            return `${year}-${month}-${day}`; 
        }
        return "";
    }

    // Función para cargar los datos de la tabla al cargar la página
    function cargarInventario() {
        fetch("http://200.100.20.66:3000/inventario", {
            method: "GET",
            headers: {
                "Content-Type": "application/json"
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            console.log("Datos recibidos:", data);
            const tbody = document.querySelector("#inventario-table tbody");
            tbody.innerHTML = ''; // Limpiar la tabla antes de cargar nuevos datos

            // Verificamos si 'data' es un array antes de usar forEach
            if (Array.isArray(data)) {
                data.forEach(item => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${item.ITEMS}</td>
                        <td>${item.CODIGO_DEL_CLIENTE}</td>
                        <td>${item.CLIENTE}</td>
                        <td>${item.No_ACTA}</td>
                        <td>${formatDate(item.FECHA_TRANSFERENCIA)}</td>
                        <td>${item.X200}</td>
                        <td>${item.X300}</td>
                        <td>${item.X400}</td>
                        <td>${item.NC}</td>
                        <td>${item.TOTAL_CAJAS}</td>
                        <td>${item.ANEXOS}</td>
                        <td>${formatDate(item.FECHA_ENTREGA_CUSTODIA)}</td>
                        <td>${item.FUNCIONARIO}</td>
                        <td>${item.ESTADO_DEL_INVENTARIO}</td>
                        <td>${item.CAJAS_PROCESADAS}</td>
                        <td>${item.CAJA_INICIAR}</td>
                        <td>${item.CAJA_FIN}</td>
                        <td>${item.REGISTROS_PROCESADOS}</td>
                        <td>${formatDate(item.FECHA_ENTREGA)}</td>
                        <td>${formatDate(item.INICIO_INVENTARIO)}</td>
                        <td>${formatDate(item.FIN_INVENTARIO)}</td>
                        <td>${item.ESTADO_ENTREGA}</td>
                        <td>${item.MES_ENTREGA_PACA}</td>
                        <td>
                            <button class="edit-btn" data-id="${item.ITEMS}">Editar</button>
                            <button class="delete-btn" data-id="${item.ITEMS}">Eliminar</button>
                        </td>
                    `;
                    tbody.appendChild(row);
                });

                // Agregar eventos para los botones de editar y eliminar
                document.querySelectorAll(".edit-btn").forEach(btn => {
                    btn.addEventListener("click", handleEdit);
                });
                document.querySelectorAll(".delete-btn").forEach(btn => {
                    btn.addEventListener("click", handleDelete);
                });
            } else {
                console.error("La respuesta no es un array:", data);
            }
        })
        .catch(error => console.error("Error al cargar inventario:", error));
    }

    // Cargar los datos cuando se cargue la página
    cargarInventario();

    // Función para manejar el envío del formulario para agregar un nuevo registro
    addForm.addEventListener("submit", function(event) {
        event.preventDefault(); // Prevenir el comportamiento por defecto del formulario

        // Obtener los datos del formulario
        const formData = new FormData(addForm);
        const data = Object.fromEntries(formData.entries()); // Convertir a objeto

        // Enviar los datos al servidor usando fetch para agregar un nuevo registro
        fetch("http://200.100.20.66:3000/inventario", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(data)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(result => {
            alert("Registro agregado correctamente.");
            cargarInventario(); // Recargar los datos en la tabla
        })
        .catch(error => console.error("Error al agregar el registro:", error));
    });

    // Función para manejar la edición de un registro
    function handleEdit(event) {
        const id = event.target.getAttribute("data-id");

        // Obtener los datos del registro a editar
        fetch(`http://200.100.20.66:3000/inventario/${id}`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json"
            }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            for (let key in data) {
                if (addForm[key]) {
                    addForm[key].value = data[key]; // Cargar los datos en el formulario
                }
            }
            addForm.setAttribute("data-id", id); // Guardar el ID del registro a editar
        })
        .catch(error => console.error("Error al cargar el registro:", error));
    }

    // Función para manejar la eliminación de un registro
    function handleDelete(event) {
        const id = event.target.getAttribute("data-id");

        if (confirm("¿Estás seguro de eliminar este registro?")) {
            fetch(`http://200.100.20.66:3000/inventario/${id}`, {
                method: "DELETE",
                headers: {
                    "Content-Type": "application/json"
                }
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Error ${response.status}: ${response.statusText}`);
                }
                return response.json();
            })
            .then(result => {
                alert("Registro eliminado correctamente.");
                cargarInventario(); // Recargar los datos en la tabla
            })
            .catch(error => console.error("Error al eliminar el registro:", error));
        }
    }
});
document.getElementById('salir-btn-inventario').addEventListener('click', () => {
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
