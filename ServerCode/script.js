function toggleSidebar() {
    const sidebar = document.querySelector(".sidebar");
    if (sidebar.style.width === "60px") {
        sidebar.style.width = "200px";
    } else {
        sidebar.style.width = "60px";
    }
}