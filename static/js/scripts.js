

const content_dir = 'contents/'
const config_file = 'config.yml'
const section_names = ['home', 'publications', 'awards']


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


    // Yaml
    fetch(content_dir + config_file)
        .then(response => response.text())
        .then(text => {
            const yml = jsyaml.load(text);
            Object.keys(yml).forEach(key => {
                try {
                    document.getElementById(key).innerHTML = yml[key];
                } catch {
                    console.log("Unknown id and value: " + key + "," + yml[key].toString())
                }

            })
        })
        .catch(error => console.log(error));


    // Marked
    marked.use({ mangle: false, headerIds: false })
    section_names.forEach((name, idx) => {
        fetch(content_dir + name + '.md')
            .then(response => response.text())
            .then(markdown => {
                const html = marked.parse(markdown);
                const host = document.getElementById(name + '-md');
                if (host) {
                    host.innerHTML = html;
                }
            }).then(() => {
                // MathJax
                if (window.MathJax && typeof MathJax.typeset === 'function') {
                    MathJax.typeset();
                }
            })
            .catch(error => console.log(error));
    })

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
