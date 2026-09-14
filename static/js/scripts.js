

window.addEventListener('DOMContentLoaded', event => {

    // Activate Bootstrap scrollspy on the main nav element
    const mainNav = document.body.querySelector('#mainNav');
    if (mainNav && typeof bootstrap !== 'undefined' && bootstrap.ScrollSpy) {
        new bootstrap.ScrollSpy(document.body, {
            target: '#mainNav',
            offset: 74,
        });
    };

    // Collapse responsive navbar when toggler is visible
    const navbarToggler = document.body.querySelector('.navbar-toggler');
    const responsiveNavItems = [].slice.call(
        document.querySelectorAll('#navbarResponsive .nav-link')
    );
    if (navbarToggler) {
        responsiveNavItems.map(function (responsiveNavItem) {
            responsiveNavItem.addEventListener('click', () => {
                if (window.getComputedStyle(navbarToggler).display !== 'none') {
                    navbarToggler.click();
                }
            });
        });
    }


    // Yaml + Marked 数据加载逻辑已移除：原逻辑依赖未定义的 content_dir
    // 且目标文件 (config.yml / *.md) 已不存在，属于 New Age 主题遗留死代码。
    // 网站内容现直接写在 HTML 中，不再需要运行时 fetch。


    // Back-to-top button logic
    const backToTopBtn = document.getElementById('backToTop');
    if (backToTopBtn) {
        const toggleBackToTop = () => {
            if (window.scrollY > 200) {
                backToTopBtn.classList.add('show');
            } else {
                backToTopBtn.classList.remove('show');
            }
        };

        window.addEventListener('scroll', toggleBackToTop);
        toggleBackToTop();

        backToTopBtn.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }

}); 

// 插入共享的首页副标题（兼容不同目录层级的页面）
// 插入共享的首页副标题（兼容不同目录层级的页面）——确保在 DOM 完全解析后运行
function loadSharedHomeSubtitle() {
    const candidatePaths = [
        'static/partials/home-subtitle.html',
        '../static/partials/home-subtitle.html',
        '../../static/partials/home-subtitle.html',
        '/static/partials/home-subtitle.html' // 站点根路径（如果可用）
    ];
    const containerSelector = '.top-section .container';
    const targetContainer = document.querySelector(containerSelector);
    if (!targetContainer) return;

    // 如果页面中已经存在共享副标题或原始副标题（.text-white.lead），则跳过
    if (targetContainer.querySelector('.shared-home-subtitle') || targetContainer.querySelector('.text-white.lead')) return;

    // 尝试多个路径，直到成功加载片段
    (async function tryFetchPaths() {
        for (const p of candidatePaths) {
            try {
                const resp = await fetch(p, { cache: 'no-cache' });
                if (!resp.ok) continue;
                const html = await resp.text();
                if (!html || html.trim().length === 0) continue;

                const wrapper = document.createElement('div');
                wrapper.className = 'shared-home-subtitle';
                wrapper.innerHTML = html;
                // 保证插入位置在名字下方
                const h2 = targetContainer.querySelector('#top-section-bg-text');
                if (h2 && h2.parentNode) {
                    h2.insertAdjacentElement('afterend', wrapper);
                } else {
                    targetContainer.appendChild(wrapper);
                }
                return; // 成功后退出
            } catch (err) {
                // 继续尝试下一个候选路径
                continue;
            }
        }
        // 如果都失败，可选地在控制台报告（不阻塞页面）
        console.log('shared-home-subtitle: failed to load from candidate paths');
    })();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadSharedHomeSubtitle);
} else {
    loadSharedHomeSubtitle();
}

// ────────────────────────────────────────────────────────
// 移动端展开/折叠功能
// ────────────────────────────────────────────────────────

// 等待页面完全加载后执行
window.addEventListener('DOMContentLoaded', function () {
    const mobile = window.matchMedia('(max-width: 768px)');
    [['about-content', 'about-expand-btn'], ['teaching-content', 'teaching-expand-btn']].forEach(([contentId, buttonId]) => {
        const content = document.getElementById(contentId);
        const button = document.getElementById(buttonId);
        if (!content || !button) return;
        button.setAttribute('aria-controls', contentId);
        function setExpanded(expanded) {
            content.classList.toggle('expanded', expanded);
            button.classList.toggle('expanded', expanded);
            button.setAttribute('aria-expanded', String(expanded));
            button.innerHTML = expanded ? '收起内容 <span aria-hidden="true">▲</span>' : '展开更多 <span aria-hidden="true">▼</span>';
        }
        function syncLayout() {
            button.style.display = mobile.matches ? 'block' : 'none';
            setExpanded(!mobile.matches);
        }
        button.addEventListener('click', () => setExpanded(!content.classList.contains('expanded')));
        mobile.addEventListener('change', syncLayout);
        syncLayout();
    });
});
