let registry = []; 
let syncedPlatforms = new Set();

const syncBtn = document.getElementById('sync-btn');
const handleInput = document.getElementById('user-handle');
const platformSelect = document.getElementById('platform-select');
const terminal = document.getElementById('terminal-output');
const dashboard = document.getElementById('dashboard');

syncBtn.onclick = async () => {
    const val = handleInput.value.trim();
    const platform = platformSelect.value;
    if (!val) return;

    terminal.innerText = `// INITIATING_TRANSFER: ${platform.toUpperCase()}...`;
    
    try {
        if (platform === 'codeforces') {
            await fetchCF(val);
        } else if (platform === 'leetcode') {
            await fetchLC(val);
        } else {
            // CSES & VJUDGE: Manual override because they block browser APIs
            injectManual(val, platform.toUpperCase());
        }

        syncedPlatforms.add(platform.toUpperCase());
        dashboard.style.display = 'block';
        updateUI();
        terminal.innerText = `// ${platform.toUpperCase()}_SYNC_COMPLETE. DATA_MERGED.`;
        handleInput.value = "";
    } catch (e) {
        console.error(e);
        terminal.innerText = `// CRITICAL_FAILURE: ${platform.toUpperCase()} CONNECTION_REFUSED.`;
    }
};

async function fetchCF(handle) {
    const res = await fetch(`https://codeforces.com/api/user.status?handle=${handle}`);
    const data = await res.json();
    if (data.status === "OK") {
        const solved = data.result.filter(s => s.verdict === "OK").map(s => ({
            id: `${s.problem.contestId}${s.problem.index}`,
            tag: (s.problem.tags && s.problem.tags[0]) ? s.problem.tags[0] : 'algorithm',
            src: 'CF'
        }));
        mergeData(solved);
    } else throw new Error();
}

async function fetchLC(handle) {
    // Using a CORS Proxy to prevent "UPLINK_INTERRUPTED"
    const proxy = "https://api.allorigins.win/get?url=";
    const target = encodeURIComponent(`https://leetcode-stats-api.herokuapp.com/${handle}`);
    
    const res = await fetch(`${proxy}${target}`);
    const json = await res.json();
    const data = JSON.parse(json.contents);

    if (data.status === "success") {
        const solved = [];
        ['easy', 'medium', 'hard'].forEach(lvl => {
            for(let i=0; i<data[`${lvl}Solved`]; i++) {
                solved.push({ id: `${lvl}-${i}`, tag: lvl, src: 'LC' });
            }
        });
        mergeData(solved);
    } else throw new Error();
}

function injectManual(count, platformName) {
    const num = parseInt(count) || 0;
    if (num <= 0) {
        terminal.innerText = `// INPUT_ERROR: Enter solve count for ${platformName}`;
        return;
    }
    const items = [];
    const tag = platformName === 'CSES' ? 'cses-set' : 'vjudge-set';
    for(let i=0; i<num; i++) {
        items.push({ id: `${platformName}-${i}`, tag: tag, src: platformName });
    }
    mergeData(items);
}

function mergeData(newItems) {
    newItems.forEach(item => {
        const uid = `${item.src}-${item.id}`;
        if (!registry.find(r => r.uid === uid)) {
            registry.push({ ...item, uid });
        }
    });
}

function updateUI() {
    const grouped = {};
    registry.forEach(item => {
        if (!grouped[item.tag]) grouped[item.tag] = [];
        grouped[item.tag].push(`${item.src}:${item.id}`);
    });

    document.getElementById('total-counter').innerText = registry.length;
    document.getElementById('tag-counter').innerText = Object.keys(grouped).length;
    document.getElementById('platform-list').innerText = Array.from(syncedPlatforms).join(" + ");

    renderGraph(grouped);
    renderTable(grouped);
}

function renderGraph(grouped) {
    const container = document.getElementById('bubble-graph');
    container.innerHTML = "";
    const nodes = Object.keys(grouped).map(tag => ({ id: tag, val: grouped[tag].length }));
    
    const width = container.offsetWidth, height = 550;
    const svg = d3.select("#bubble-graph").append("svg").attr("width", "100%").attr("height", height);
    const g = svg.append("g");

    const zoom = d3.zoom().scaleExtent([0.1, 5]).on("zoom", (e) => g.attr("transform", e.transform));
    svg.call(zoom);

    const radiusScale = d3.scaleSqrt().domain([0, d3.max(nodes, d => d.val) || 1]).range([35, 100]);
    
    const sim = d3.forceSimulation(nodes)
        .force("charge", d3.forceManyBody().strength(-100))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collision", d3.forceCollide().radius(d => radiusScale(d.val) + 12))
        .force("x", d3.forceX(width / 2).strength(0.15))
        .force("y", d3.forceY(height / 2).strength(0.15));

    const node = g.selectAll("g").data(nodes).join("g")
        .call(d3.drag()
            .on("start", (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
            .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
            .on("end", (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }));

    node.append("circle")
        .attr("r", d => radiusScale(d.val))
        .attr("class", "node-circle");

    node.append("text").text(d => d.id.toUpperCase())
        .attr("text-anchor", "middle").attr("dy", ".35em").attr("class", "node-label")
        .style("font-size", d => Math.min(radiusScale(d.val) / 3.2, 14) + "px");

    sim.on("tick", () => node.attr("transform", d => `translate(${d.x}, ${d.y})`));
}

function renderTable(grouped) {
    const body = document.getElementById('table-body');
    body.innerHTML = "";
    Object.keys(grouped).sort((a,b) => grouped[b].length - grouped[a].length).forEach(tag => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="tag-cell">${tag}</td>
            <td class="data-cell">${grouped[tag].slice(0, 5).join(", ")}...</td>
            <td class="val-cell">${grouped[tag].length}</td>
        `;
        body.appendChild(row);
    });
}

function toggleGraph() {
    const wrapper = document.getElementById('graph-wrapper');
    const closeBtn = document.getElementById('toggle-graph-btn');
    const restoreBtn = document.getElementById('restore-graph-btn');
    const isHidden = wrapper.style.display === "none";

    wrapper.style.display = isHidden ? "block" : "none";
    closeBtn.style.display = isHidden ? "flex" : "none";
    restoreBtn.style.display = isHidden ? "none" : "block";
}