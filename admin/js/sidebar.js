function initSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebarToggle');
  const expandBtn = document.getElementById('sidebarExpand');

  const collapsed = localStorage.getItem('sidebarCollapsed') === 'true';
  if (collapsed) sidebar.classList.add('collapsed');

  function toggle() {
    sidebar.classList.toggle('collapsed');
    localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
  }

  if (toggleBtn) toggleBtn.addEventListener('click', toggle);
  if (expandBtn) expandBtn.addEventListener('click', toggle);

  // Highlight the current page's link
  const currentPage = window.location.pathname.split('/').pop();
  document.querySelectorAll('.sidebar-link').forEach(link => {
    if (link.getAttribute('href') === currentPage) {
      link.classList.add('active');
    }
  });
}

document.addEventListener('DOMContentLoaded', initSidebar);