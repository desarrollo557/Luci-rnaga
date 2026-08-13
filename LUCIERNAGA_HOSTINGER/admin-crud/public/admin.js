document.addEventListener('DOMContentLoaded', () => {
    const userTableBody = document.getElementById('user-table-body');
    const createForm = document.getElementById('create-form');
    const editForm = document.getElementById('edit-form');
    const logoutLink = document.getElementById('logout-link');

    // Verificar autenticación al cargar la página
    async function checkAuth() {
        try {
            const response = await fetch('http://200.100.20.66:3000/checkAuth');
            if (response.status === 200) {
                loadUsers(); // Cargar usuarios si está autenticado
            } else {
                window.location.href = '/'; // Redirigir al login si no está autenticado
            }
        } catch (error) {
            console.error('Error verificando autenticación:', error);
            window.location.href = '/'; // Redirigir al login en caso de error
        }
    }

    // Cargar usuarios al iniciar
    async function loadUsers() {
        try {
            const response = await fetch('http://200.100.20.66:3000/users');
            if (!response.ok) {
                throw new Error('Error al obtener usuarios');
            }
            const users = await response.json();
            populateUserTable(users);
        } catch (error) {
            console.error('Error cargando usuarios:', error);
        }
    }

    // Función para llenar la tabla de usuarios
    function populateUserTable(users) {
        userTableBody.innerHTML = ''; // Limpiar la tabla
        users.forEach(user => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${user.cc}</td>
                <td>${user.nombre}</td>
                <td>${user.rol}</td>
                <td>${user.sede}</td> 
                <td>
                    <button onclick="editUser(${user.id})">Editar</button>
                    <button onclick="deleteUser(${user.id})">Eliminar</button>
                </td>
            `;
            userTableBody.appendChild(row);
        });
    }

    // Función para manejar la creación de un nuevo usuario
    createForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const cc = document.getElementById('create-cc').value;
        const nombre = document.getElementById('create-name').value;
        const contrasena = document.getElementById('create-password').value;
        const rol = document.getElementById('create-role').value;
        const sede = document.getElementById('create-sede').value; // Capturar el valor de sede

        try {
            const response = await fetch('http://200.100.20.66:3000/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cc, nombre, contrasena, rol, sede }) // Incluir sede en la solicitud
            });

            if (!response.ok) {
                throw new Error(await response.text());
            }

            alert('Usuario creado exitosamente');
            loadUsers(); // Recargar la lista de usuarios
            createForm.reset(); // Limpiar el formulario
        } catch (error) {
            console.error('Error creando usuario:', error);
            alert('Error al crear usuario');
        }
    });

    // Función para manejar la edición de un usuario
    window.editUser = function(id) {
        fetch(`http://200.100.20.66:3000/users/${id}`)
            .then(response => response.json())
            .then(user => {
                document.getElementById('edit-cc').value = user.cc;
                document.getElementById('edit-name').value = user.nombre;
                document.getElementById('edit-password').value = user.contrasena;
                document.getElementById('edit-role').value = user.rol;
                document.getElementById('edit-sede').value = user.sede; // Cargar la sede existente en el formulario de edición
                editForm.style.display = 'block'; // Mostrar el formulario de edición

                editForm.onsubmit = async (event) => {
                    event.preventDefault();

                    const cc = document.getElementById('edit-cc').value;
                    const nombre = document.getElementById('edit-name').value;
                    const contrasena = document.getElementById('edit-password').value;
                    const rol = document.getElementById('edit-role').value;
                    const sede = document.getElementById('edit-sede').value; // Capturar el valor de sede

                    try {
                        const response = await fetch(`http://200.100.20.66:3000/users/${id}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ cc, nombre, contrasena, rol, sede }) // Incluir sede en la solicitud
                        });

                        if (!response.ok) {
                            throw new Error(await response.text());
                        }

                        alert('Usuario actualizado exitosamente');
                        loadUsers(); // Recargar la lista de usuarios
                        editForm.reset(); // Limpiar el formulario
                        editForm.style.display = 'none'; // Ocultar el formulario de edición
                    } catch (error) {
                        console.error('Error actualizando usuario:', error);
                        alert('Error al actualizar usuario');
                    }
                };
            })
            .catch(error => {
                console.error('Error obteniendo usuario:', error);
                alert('Error al obtener usuario');
            });
    };

    // Función para manejar la eliminación de un usuario
    window.deleteUser = function(id) {
        if (confirm('¿Estás seguro de que quieres eliminar este usuario?')) {
            fetch(`http://200.100.20.66:3000/users/${id}`, {
                method: 'DELETE'
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Error al eliminar usuario');
                }
                alert('Usuario eliminado exitosamente');
                loadUsers(); // Recargar la lista de usuarios
            })
            .catch(error => {
                console.error('Error eliminando usuario:', error);
                alert('Error al eliminar usuario');
            });
        }
    };

    // Manejar el cierre de sesión
    logoutLink.addEventListener('click', async (event) => {
        event.preventDefault();

        try {
            const response = await fetch('http://200.100.20.66:3000/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.ok) {
                window.location.href = '/'; // Redirigir al login
            } else {
                console.error('Error al cerrar sesión');
                alert('Error al cerrar sesión');
            }
        } catch (error) {
            console.error('Error al cerrar sesión:', error);
            alert('Error al cerrar sesión');
        }
    });

    // Verificar autenticación al cargar la página
    checkAuth();
});
