// Help system - loads and renders help content from JSON

let helpData = null;

async function loadHelpContent() {
    console.log('Loading help content from data/help.json...');
    try {
        const response = await fetch('data/help.json');
        console.log('Help fetch response:', response.status, response.statusText);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        helpData = await response.json();
        console.log('Help data loaded successfully:', helpData);
        renderHelpModal();
        console.log('Help modal rendered');
    } catch (error) {
        console.error('Failed to load help content:', error);
        // Fallback: create minimal help
        document.getElementById('help-modal').innerHTML = `
            <div class="modal-content">
                <span class="modal-close">&times;</span>
                <h2>Help</h2>
                <p>Help content failed to load: ${error.message}</p>
                <p>Check console for details.</p>
            </div>
        `;
    }
}

function renderHelpModal() {
    if (!helpData) return;

    const modal = document.getElementById('help-modal');

    const tabs = helpData.tabs.map(tab =>
        `<button class="help-tab${tab.id === 'parameters' ? ' active' : ''}" data-tab="${tab.id}">${tab.title}</button>`
    ).join('');

    const panels = helpData.tabs.map((tab, idx) =>
        `<div id="help-${tab.id}" class="help-panel${idx === 0 ? ' active' : ''}">
            <h3>${tab.title}</h3>
            ${renderSections(tab.sections)}
        </div>`
    ).join('');

    modal.innerHTML = `
        <div class="modal-content">
            <span class="modal-close">&times;</span>
            <h2>Help & Reference Guide</h2>
            <div class="help-tabs">${tabs}</div>
            <div class="help-content">${panels}</div>
        </div>
    `;

    // Reattach event listeners
    document.querySelector('.modal-close').addEventListener('click', closeHelpModal);
    document.getElementById('help-modal').addEventListener('click', (e) => {
        if (e.target.id === 'help-modal') closeHelpModal();
    });
    document.querySelectorAll('.help-tab').forEach(tab => {
        tab.addEventListener('click', () => switchHelpTab(tab.dataset.tab));
    });
}

function renderSections(sections) {
    return sections.map(section => {
        switch (section.type) {
            case 'parameter':
                return renderParameter(section);
            case 'example':
                return renderExample(section);
            case 'conversions':
                return renderList(section, 'tip-box');
            case 'warnings':
                return renderList(section, 'warning-box');
            case 'formula':
                return renderFormula(section);
            case 'tips':
                return renderList(section, 'tip-box');
            case 'boxtype':
                return renderBoxType(section);
            case 'alignment-group':
                return renderAlignmentGroup(section);
            case 'guide':
                return renderGuide(section);
            case 'intro':
                return `<div class="tip-box"><p>${section.content}</p></div>`;
            case 'size-table':
                return renderSizeTable(section);
            case 'size-comparison':
                return renderSizeComparison(section);
            case 'alignment-impact':
                return renderAlignmentImpact(section);
            default:
                return '';
        }
    }).join('');
}

function renderParameter(param) {
    let html = `<div class="param-item">
        <strong>${param.name}</strong>
        <p>${param.description}</p>`;

    if (param.details) {
        html += '<ul>' + param.details.map(d => `<li>${d}</li>`).join('') + '</ul>';
    }

    html += `<em>Spec sheet: ${param.specSheet}</em>`;

    if (param.conversion) {
        html += `<div class="conversion">${param.conversion}</div>`;
    }

    if (param.warning) {
        html += `<div class="note">⚠️ ${param.warning}</div>`;
    }

    html += '</div>';
    return html;
}

function renderExample(section) {
    let html = `<div class="example-box">
        <h4>${section.title}</h4>
        <table class="mapping-table">
            <tr>
                <th>Spec Sheet Label</th>
                <th>Value</th>
                <th>Input Field</th>
                <th>Notes</th>
            </tr>`;

    section.mapping.forEach(row => {
        html += `<tr>
            <td>${row.spec}</td>
            <td>${row.value}</td>
            <td>${row.field}</td>
            <td>${row.note}</td>
        </tr>`;
    });

    html += '</table></div>';
    return html;
}

function renderList(section, cssClass) {
    const items = section.items || section.details || [];
    return `<div class="${cssClass}">
        <h4>${section.title}</h4>
        <ul>${items.map(item => `<li>${item}</li>`).join('')}</ul>
    </div>`;
}

function renderFormula(section) {
    let html = `<div class="relationship-item">
        <h4>${section.title}</h4>
        <div class="formula-box"><strong>${section.formula}</strong></div>
        <p>${section.description}</p>`;

    if (section.example) {
        html += `<div class="example-calc"><strong>Example:</strong> ${section.example}</div>`;
    }

    if (section.guide) {
        html += '<ul>' + section.guide.map(g => `<li>${g}</li>`).join('') + '</ul>';
    }

    if (section.reference) {
        html += '<div class="tip-box"><h4>Reference</h4><ul>' +
                section.reference.map(r => `<li>${r}</li>`).join('') + '</ul></div>';
    }

    if (section.note) {
        html += `<div class="note">${section.note}</div>`;
    }

    if (section.warning) {
        html += `<div class="warning-box"><p>${section.warning}</p></div>`;
    }

    html += '</div>';
    return html;
}

function renderBoxType(box) {
    let html = `<div class="box-type">
        <h4>${box.name}</h4>
        <p>${box.description}</p>
        <strong>Pros:</strong>
        <ul>${box.pros.map(p => `<li>${p}</li>`).join('')}</ul>
        <strong>Cons:</strong>
        <ul>${box.cons.map(c => `<li>${c}</li>`).join('')}</ul>
        <strong>Best for:</strong> ${box.bestFor}`;

    if (box.note) {
        html += `<br><em>(${box.note})</em>`;
    }

    html += '</div>';
    return html;
}

function renderAlignmentGroup(group) {
    let html = `<div class="alignment-type">
        <h4>${group.category}</h4>`;

    group.alignments.forEach(alignment => {
        html += `<div class="alignment-item">
            <strong>${alignment.name}</strong>
            <p>${alignment.description}</p>
            <ul>${alignment.features.map(f => `<li>${f}</li>`).join('')}</ul>
        </div>`;
    });

    html += '</div>';
    return html;
}

function renderGuide(guide) {
    return `<div class="tip-box">
        <h4>${guide.title}</h4>
        <p><strong>Sealed:</strong> ${guide.sealed}</p>
        <p><strong>Ported:</strong> ${guide.ported}</p>
    </div>`;
}

function renderSizeTable(section) {
    let html = `<div class="example-box">
        <h4>${section.title}</h4>
        <p>${section.description}</p>
        <table class="mapping-table">
            <tr>
                <th>Driver Size</th>
                <th>Sealed Box</th>
                <th>Ported Box</th>
                <th>Size Reference</th>
            </tr>`;

    section.sizes.forEach(size => {
        html += `<tr>
            <td><strong>${size.driver}</strong></td>
            <td>${size.sealed}</td>
            <td>${size.ported}</td>
            <td>${size.example}</td>
        </tr>`;
    });

    html += '</table></div>';
    return html;
}

function renderSizeComparison(section) {
    let html = `<div class="tip-box">
        <h4>${section.title}</h4>`;

    section.comparisons.forEach(comp => {
        html += `<div class="param-item">
            <strong>${comp.volume}</strong>
            <p>Dimensions: ${comp.dimensions}</p>
            <p><em>Similar size to: ${comp.reference}</em></p>
        </div>`;
    });

    html += '</div>';
    return html;
}

function renderAlignmentImpact(section) {
    let html = `<div class="relationship-item">
        <h4>${section.title}</h4>
        <p>${section.description}</p>`;

    section.impacts.forEach(impact => {
        html += `<div class="param-item">
            <strong>${impact.alignment}</strong>
            <p>Box Size: ${impact.size}</p>
            <p><em>Tradeoff: ${impact.tradeoff}</em></p>
        </div>`;
    });

    html += '</div>';
    return html;
}
