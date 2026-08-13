document.getElementById('login-form').addEventListener('submit', function(event) {
  event.preventDefault(); // ¡Evita el submit tradicional!

  const cc = document.getElementById('cc').value;
  const contrasena = document.getElementById('contrasena').value;

  fetch('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cc, contrasena })
  })
  .then(async response => {
    const data = await response.json();
    if (data.redirect) {
      window.location.href = data.redirect; // redirige si login exitoso
    } else {
      alert(data.message || 'Usuario o contraseña incorrectos');
    }
  })
  .catch(err => {
    alert('Error al conectarse al servidor');
    console.error(err);
  });
});
