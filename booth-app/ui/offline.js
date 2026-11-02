const u = new URLSearchParams(location.search).get('u');
if (u) setTimeout(() => { location.href = u; }, 5000);
