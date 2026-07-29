let copsData = [];
let ratesData = [];
let currentCopId = null;
let currentView = 'all'; 
let currentDisplayCount = 50;

    let archiveLoaded = false;

    function escapeRegExp(s) {
        return String(s).replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
    }

    /** Safe search highlights: text nodes + spans, no HTML parsing of user data. */
    function appendHighlighted(container, text, searchTerm) {
        container.replaceChildren();
        const t = text == null ? '' : String(text);
        const term = (searchTerm || '').trim();
        if (!term) {
            container.appendChild(document.createTextNode(t));
            return;
        }
        try {
            const pattern = new RegExp('(' + escapeRegExp(term) + ')', 'gi');
            let lastIndex = 0;
            let m;
            while ((m = pattern.exec(t)) !== null) {
                if (m.index > lastIndex) {
                    container.appendChild(document.createTextNode(t.slice(lastIndex, m.index)));
                }
                const span = document.createElement('span');
                span.className = 'highlight';
                span.textContent = m[1];
                container.appendChild(span);
                lastIndex = m.lastIndex;
            }
            if (lastIndex < t.length) {
                container.appendChild(document.createTextNode(t.slice(lastIndex)));
            }
        } catch (e) {
            container.appendChild(document.createTextNode(t));
        }
    }

    function createLabel(text) {
        const l = document.createElement('label');
        l.textContent = text;
        return l;
    }

    function createTextInput(name, opts = {}) {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.name = name;
        if (opts.className) inp.className = opts.className;
        if (opts.list) inp.setAttribute('list', opts.list);
        return inp;
    }

    function appendEscalationCheckboxes(parent, index) {
        parent.appendChild(createLabel('Escalated Situation:'));
        const esc = document.createElement('input');
        esc.type = 'checkbox';
        esc.name = 'cops-' + index + '-esc';
        esc.value = 'y';
        parent.appendChild(esc);
        parent.appendChild(createLabel('De-escalated Situation:'));
        const de = document.createElement('input');
        de.type = 'checkbox';
        de.name = 'cops-' + index + '-de_esc';
        de.value = 'y';
        parent.appendChild(de);
    }

    function appendNewCopTag(copTags) {
        const entries = copTags.getElementsByClassName('cop-tag');
        const newIndex = entries.length;
        const newEntry = document.createElement('div');
        newEntry.className = 'cop-tag';
        const p = document.createElement('p');
        p.appendChild(createLabel('City: '));
        p.appendChild(createTextInput('cops-' + newIndex + '-dept', { className: 'form-input', list: 'dept-list' }));
        p.appendChild(document.createElement('br'));
        p.appendChild(createLabel('Rank: '));
        p.appendChild(createTextInput('cops-' + newIndex + '-rank', { className: 'form-input' }));
        p.appendChild(createLabel('First Name:'));
        p.appendChild(createTextInput('cops-' + newIndex + '-first', { className: 'form-input' }));
        p.appendChild(createLabel('Last Name:'));
        p.appendChild(createTextInput('cops-' + newIndex + '-last', { className: 'form-input' }));
        p.appendChild(createLabel('Badge #:'));
        p.appendChild(createTextInput('cops-' + newIndex + '-badge', { className: 'form-input' }));
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'remove-cop';
        rm.textContent = 'remove';
        p.appendChild(rm);
        newEntry.appendChild(p);
        const div = document.createElement('div');
        const p2 = document.createElement('p');
        p2.style.borderBottom = '1px solid #555555';
        appendEscalationCheckboxes(p2, newIndex);
        div.appendChild(p2);
        newEntry.appendChild(div);
        copTags.appendChild(newEntry);
    }

    function appendGenericFilePreview(previewDiv, fileName, sizeBytes) {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'text-align: center; padding: 20px;';
        const icon = document.createElement('div');
        icon.style.cssText = 'font-size: 48px; margin-bottom: 10px;';
        icon.textContent = '📄';
        const nameEl = document.createElement('div');
        nameEl.textContent = fileName;
        const sizeEl = document.createElement('div');
        sizeEl.style.cssText = 'color: #cccccc; font-size: 0.9em;';
        sizeEl.textContent = formatFileSize(sizeBytes);
        wrap.appendChild(icon);
        wrap.appendChild(nameEl);
        wrap.appendChild(sizeEl);
        previewDiv.appendChild(wrap);
    }

//archive loading api call stuff
async function showArchive() {
    DOM.homecontainer.style.display = 'none';
    DOM.chat.style.display = 'none';
    if (!archiveLoaded) {
        try {
            const res = await fetch('/api/cops');
            if (!res.ok) throw new Error('Failed to load archive');
            const data = await res.json();

            copsData = data;
            processCopsData(copsData);
            archiveLoaded = true;
        } catch (err) {
            console.error(err);
            alert('Failed to load archive');
            archiveBtn.disabled = false;
            return;
        }
    }

    archiveView.style.display = 'block';
    showSearchResults();
}

function toggle_chat() {
    if (DOM.chat.style.display === 'none') {
        DOM.chat.style.display = 'block';
    } else {
        DOM.chat.style.display = 'none';
    }
}

function processCopsData(copsData) {
    const rateMap = new Map();

    copsData.forEach(cop => {
        cop.ratings.forEach(rating => {
            if (!rateMap.has(rating.id)) {
                rateMap.set(rating.id, {
                    id: rating.id,
                    time: rating.time,
                    loc: rating.loc,
                    txt: rating.txt,
                    files: rating.tags,
                    cops: [],
                    esc: false,
                    de_esc: false
                });
            }

            const rate = rateMap.get(rating.id);
            const copInfo =
                `${cop.first} ${cop.last}` +
                `${cop.rank ? ` - ${cop.rank}` : ''}` +
                `${cop.dept ? ` - ${cop.dept}` : ''}` +
                `${cop.badge ? ` #${cop.badge}` : ''}`;

            rate.cops.push(copInfo);
            if (rating.esc) rate.esc = true;
            if (rating.de_esc) rate.de_esc = true;
        });
    });

    ratesData = Array.from(rateMap.values()).map(rate => ({
        ...rate,
        cops: rate.cops.join(', ')
    }));

    const deptFilter = document.getElementById('deptFilter');
        const departments = getUniqueDepartments();
        departments.forEach(dept => {
            const option = document.createElement('option');
            option.value = dept;
            option.textContent = dept;
            deptFilter.appendChild(option);
        });
    const urlParams = new URLSearchParams(window.location.search);
    setView(urlParams.get('type') || 'all');
    DOM.archiveView.style.display = 'block';
}

function mergeCopsData(rating) {
    if (!rating || !Array.isArray(rating.cops)) return;
    rating.cops.forEach(copDetails => {
        const first = (copDetails.first || '').trim();
        const last = (copDetails.last || '').trim();
        const dept = (copDetails.dept || '').trim();
        if (!first && !last) return;
        let cop = copsData.find(c =>
            c.first === first &&
            c.last === last &&
            c.dept === dept
        );
        if (!cop) {
            cop = {
                id: crypto.randomUUID(),
                first,
                last,
                dept,
                rank: copDetails.rank || '',
                badge: copDetails.badge || '',
                ratings: []
            };
            copsData.push(cop);
        }
        // Prevent duplicate rating
        if (!cop.ratings.some(r => r.id === rating.id)) {
            cop.ratings.push({
                id: rating.id,
                time: rating.time,
                loc: rating.location,
                txt: rating.description,
                tags: rating.tags || '',
                esc: copDetails.escalated || false,
                de_esc: copDetails.deEscalated || false
            });
        }

    });
    processCopsData(copsData);
}

function gohome() {
    DOM.archiveView.style.display = 'none';
    DOM.hostsettings.style.display = 'none';
    DOM.joinsettings.style.display = 'none';
    DOM.chat.style.display = 'none';

    DOM.homecontainer.style.display = 'block';

}

function setView(type) {
        currentView = type;
        DOM.sortButtons.forEach(button => {
            button.style.display = 'none';
            button.classList.remove('active');
        });
        if (type !== 'all') {
            if (type === 'cops') {
                document.getElementById('sortFirst').style.display = 'block';
                document.getElementById('sortLast').style.display = 'block';
                document.getElementById('sortSal').style.display = 'block';
                document.getElementById('sortRatings').style.display = 'block';
                // Make salary sort active by default for cops
                const salSortButton = document.getElementById('sortSal');
                salSortButton.classList.add('active');
            }
            if (type === 'rates') {
                const timeSortButton = document.getElementById('sortTime');
                timeSortButton.style.display = 'block';
                timeSortButton.classList.add('active');
            }
        }
        const searchTerm = DOM.searchInput.value.toLowerCase();
        performSearch(searchTerm);
    }

function showSearchResults() {
    DOM.searchControls.style.display = 'flex';
    DOM.sf.style.display = 'block';
    DOM.sortControls.style.display = 'flex';
    DOM.deptFilter.style.display = 'block';
    DOM.resultsContainer.style.display = 'grid';
    DOM.copView.style.display = 'none';
    DOM.rateView.style.display = 'none';
    DOM.rateFormView.style.display = 'none';
    DOM.toggle.style.display = 'block';
}

function view_cop(copId) {
        const cop = copsData.find(c => c.id === copId);
        if (!cop) return;
        DOM.searchControls.style.display = 'none';
        DOM.sf.style.display = 'none';
        DOM.sortControls.style.display = 'none';
        DOM.deptFilter.style.display = 'none';
        currentCopId = copId;
        const copView = DOM.copView;
        const copContent = copView.querySelector('.cop-content');
        const totalRatings = cop.ratings.length;
        const escCount = cop.ratings.filter(r => r.esc).length;
        const de_escCount = cop.ratings.filter(r => r.de_esc).length;
        const escPercent = totalRatings > 0 ? (escCount / totalRatings * 100) : 0;
        const de_escPercent = totalRatings > 0 ? (de_escCount / totalRatings * 100) : 0;
        const sortedRatings = [...cop.ratings].sort((a, b) =>
            new Date(b.time).getTime() - new Date(a.time).getTime()
        );
        const searchTerm = DOM.searchInput.value.toLowerCase();

        copContent.replaceChildren();

        const h2 = document.createElement('h2');
        h2.className = 'cop';
        const pName = document.createElement('p');
        pName.className = 'cophead';
        appendHighlighted(pName, cop.first + ' ' + cop.last, searchTerm);
        h2.appendChild(pName);
        const pRank = document.createElement('p');
        pRank.className = 'h2head';
        pRank.textContent = cop.rank || 'unknown';
        h2.appendChild(pRank);
        const pDept = document.createElement('p');
        pDept.className = 'h2head';
        appendHighlighted(pDept, cop.dept || '', searchTerm);
        h2.appendChild(pDept);
        const pBadge = document.createElement('p');
        pBadge.className = 'h2head';
        pBadge.textContent = '🛡# ' + (cop.badge != null ? String(cop.badge) : 'unknown');
        h2.appendChild(pBadge);
        if (cop.sal) {
            const pSal = document.createElement('p');
            pSal.className = 'h2head';
            appendHighlighted(pSal, '$' + String(cop.sal), searchTerm);
            h2.appendChild(pSal);
        }
        const barWrap = document.createElement('div');
        barWrap.style.cssText = 'position: relative; margin: 10px 0;';
        const redBar = document.createElement('div');
        redBar.style.cssText = 'width: 50%; height: 1px; background: red; margin: 5px 0; transform-origin: left center;';
        redBar.style.transform = 'scaleX(' + escPercent / 100 + ')';
        const blueBar = document.createElement('div');
        blueBar.style.cssText = 'width: 50%; height: 1px; background: blue; margin: 5px 0; transform-origin: left center;';
        blueBar.style.transform = 'scaleX(' + de_escPercent / 100 + ')';
        barWrap.appendChild(redBar);
        barWrap.appendChild(blueBar);
        h2.appendChild(barWrap);
        copContent.appendChild(h2);

        const rateEm = document.createElement('div');
        rateEm.className = 'rate-em';
        const rateBtn = document.createElement('button');
        rateBtn.textContent = 'RATE COP';
        rateBtn.addEventListener('click', () => view_rateform(cop.id));
        rateEm.appendChild(rateBtn);
        copContent.appendChild(rateEm);

        const h3 = document.createElement('h3');
        h3.textContent = 'Ratings';
        copContent.appendChild(h3);

        sortedRatings.forEach(rate => {
            const originalRate = ratesData.find(r => r.id === rate.id);
            if (!originalRate) return;
            const rateWithOp = { ...rate, op: originalRate.op };
            let repofiles = [];
            if (rateWithOp.files) {
                repofiles = rateWithOp.files.split(',').map(f => f.trim());
            }
            const headDiv = document.createElement('div');
            headDiv.className = 'h2head';
            headDiv.style.cursor = 'pointer';
            headDiv.addEventListener('click', () => view_rating(rate.id));
            const pTime = document.createElement('p');
            pTime.textContent = '🕓 ' + new Date(rate.time).toLocaleString();
            headDiv.appendChild(pTime);
            const pLoc = document.createElement('p');
            pLoc.textContent = '🌐 ' + (rate.loc || 'Unknown');
            headDiv.appendChild(pLoc);
            if (rate.esc) {
                const escDiv = document.createElement('div');
                escDiv.style.cssText = 'width: 15%; height: 1px; background: red; margin: 5px 0;';
                headDiv.appendChild(escDiv);
            }
            if (rate.de_esc) {
                const deDiv = document.createElement('div');
                deDiv.style.cssText = 'width: 15%; height: 1px; background: blue; margin: 5px 0;';
                headDiv.appendChild(deDiv);
            }
            copContent.appendChild(headDiv);

            const bodDiv = document.createElement('div');
            bodDiv.className = 'h2bod';
            const pTxt = document.createElement('p');
            pTxt.textContent = rate.txt || '';
            bodDiv.appendChild(pTxt);
            const mediaContainer = document.createElement('div');
            mediaContainer.className = 'media-container';
            if (repofiles.length > 0) {
                appendMediaGallery(mediaContainer, repofiles, rate.id, rateWithOp.op);
            }
            bodDiv.appendChild(mediaContainer);
            copContent.appendChild(bodDiv);
            copContent.appendChild(document.createElement('br'));
        });

        DOM.resultsContainer.style.display = 'none';
        copView.style.display = 'block';
        DOM.rateView.style.display = 'none';
        DOM.rateFormView.style.display = 'none';
    }

    function view_rating(rateId) {
        const rate = ratesData.find(r => r.id === rateId);
        if (!rate) return;
        for (const cop of copsData) {
            const foundRate = cop.ratings.find(r => r.id === rateId);
            if (foundRate) {
                rate.esc = foundRate.esc || false;
                rate.de_esc = foundRate.de_esc || false;
                break;
            }
        }
        DOM.searchControls.style.display = 'none';
        DOM.sf.style.display = 'none';
        DOM.sortControls.style.display = 'none';
        DOM.deptFilter.style.display = 'none';
        const rateView = DOM.rateView;
        const rateContent = rateView.querySelector('.rate-content');
        document.querySelectorAll('.media-gallery').forEach(gallery => {
            gallery.remove();
        });
        document.querySelectorAll('.media-container').forEach(container => {
            container.remove();
        });
        rateContent.replaceChildren();

        let repofiles = [];
        if (rate.files) {
            repofiles = rate.files.split(',').map(f => f.trim());
        }
        const pLocH = document.createElement('p');
        pLocH.className = 'h2head';
        pLocH.textContent = '🌐 ' + (rate.loc || 'Unknown');
        rateContent.appendChild(pLocH);
        const pTimeH = document.createElement('p');
        pTimeH.className = 'h2head';
        pTimeH.textContent = '🕓 ' + new Date(rate.time).toLocaleString();
        rateContent.appendChild(pTimeH);
        const pCopsH = document.createElement('p');
        pCopsH.className = 'h2head';
        pCopsH.textContent = '🛡 ' + (rate.cops || '');
        rateContent.appendChild(pCopsH);
        if (rate.esc) {
            const escDiv = document.createElement('div');
            escDiv.style.cssText = 'width: 15%; height: 1px; background: red; margin: 5px 0;';
            rateContent.appendChild(escDiv);
        }
        if (rate.de_esc) {
            const deDiv = document.createElement('div');
            deDiv.style.cssText = 'width: 15%; height: 1px; background: blue; margin: 5px 0;';
            rateContent.appendChild(deDiv);
        }
        const h2bod = document.createElement('div');
        h2bod.className = 'h2bod';
        const pTxtR = document.createElement('p');
        pTxtR.textContent = rate.txt || '';
        h2bod.appendChild(pTxtR);
        const mediaContainerR = document.createElement('div');
        mediaContainerR.className = 'media-container';
        if (repofiles.length > 0) {
            appendMediaGallery(mediaContainerR, repofiles, rate.id, rate.op);
        }
        h2bod.appendChild(mediaContainerR);
        rateContent.appendChild(h2bod);
        DOM.resultsContainer.style.display = 'none';
        rateView.style.display = 'block';
        DOM.copView.style.display = 'none';
    }
    function view_rateform(copId = null) {
        const cop = copId ? copsData.find(c => c.id === copId) : null;
        const rateFormView = DOM.rateFormView;
        const rateFormContent = rateFormView.querySelector('.rate-form-content');
        
        // Show/hide back button based on whether there's an initial cop
        const backButton = rateFormView.querySelector('.back-button');
        if (backButton) {
            backButton.style.display = copId ? 'block' : 'none';
        }
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const defaultDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;
        const formAction = copId ? '/ratecops?cop=' + encodeURIComponent(String(copId)) : '/ratecops';

        rateFormContent.replaceChildren();

        const h2Form = document.createElement('h2');
        h2Form.className = 'rc';
        const form = document.createElement('form');
        form.method = 'post';
        form.action = formAction;
        form.enctype = 'multipart/form-data';
        form.id = 'rateForm';

        const copTags = document.createElement('div');
        copTags.id = 'cop-tags';

        if (cop) {
            const ratingP = document.createElement('p');
            ratingP.textContent = 'RATING: ' + cop.first + ' ' + cop.last + ' ' + (cop.rank || '') + ' ' + (cop.dept || '');
            copTags.appendChild(ratingP);
            const tagDiv = document.createElement('div');
            tagDiv.className = 'cop-tag';
            const innerP = document.createElement('p');
            appendEscalationCheckboxes(innerP, 0);
            tagDiv.appendChild(innerP);
            copTags.appendChild(tagDiv);
        } else {
            const tagDiv = document.createElement('div');
            tagDiv.className = 'cop-tag';
            const innerP = document.createElement('p');
            innerP.appendChild(createLabel('City: '));
            innerP.appendChild(createTextInput('cops-0-dept', { className: 'form-input', list: 'dept-list' }));
            innerP.appendChild(document.createElement('br'));
            innerP.appendChild(createLabel('Rank: '));
            innerP.appendChild(createTextInput('cops-0-rank', { className: 'form-input' }));
            innerP.appendChild(createLabel('First Name:'));
            innerP.appendChild(createTextInput('cops-0-first', { className: 'form-input' }));
            innerP.appendChild(createLabel('Last Name:'));
            innerP.appendChild(createTextInput('cops-0-last', { className: 'form-input' }));
            innerP.appendChild(createLabel('Badge #:'));
            innerP.appendChild(createTextInput('cops-0-badge', { className: 'form-input' }));
            tagDiv.appendChild(innerP);
            const div2 = document.createElement('div');
            const pBorder = document.createElement('p');
            pBorder.style.borderBottom = '1px solid #555555';
            appendEscalationCheckboxes(pBorder, 0);
            div2.appendChild(pBorder);
            tagDiv.appendChild(div2);
            copTags.appendChild(tagDiv);
        }

        form.appendChild(copTags);

        const addCopBtn = document.createElement('button');
        addCopBtn.type = 'button';
        addCopBtn.id = 'add-cop';
        addCopBtn.textContent = 'add another cop';
        form.appendChild(addCopBtn);

        const hintP = document.createElement('p');
        hintP.textContent = '(if unknown leave blank)';
        form.appendChild(hintP);

        const fieldsP = document.createElement('p');
        fieldsP.appendChild(document.createTextNode('time (approx.): '));
        fieldsP.appendChild(document.createElement('br'));
        const dtInput = document.createElement('input');
        dtInput.type = 'datetime-local';
        dtInput.name = 'time';
        dtInput.className = 'form-input';
        dtInput.required = true;
        dtInput.value = defaultDateTime;
        fieldsP.appendChild(dtInput);
        fieldsP.appendChild(document.createElement('br'));
        fieldsP.appendChild(document.createTextNode('location: '));
        fieldsP.appendChild(document.createElement('br'));
        const locInput = document.createElement('input');
        locInput.type = 'text';
        locInput.name = 'loc';
        locInput.className = 'form-input lng';
        fieldsP.appendChild(locInput);
        fieldsP.appendChild(document.createElement('br'));
        fieldsP.appendChild(document.createElement('br'));
        fieldsP.appendChild(document.createTextNode('rating: '));
        fieldsP.appendChild(document.createElement('br'));
        const txtArea = document.createElement('textarea');
        txtArea.name = 'txt';
        txtArea.className = 'form-input lng big';
        txtArea.required = true;
        fieldsP.appendChild(txtArea);
        fieldsP.appendChild(document.createElement('br'));
        fieldsP.appendChild(document.createElement('br'));
        fieldsP.appendChild(document.createTextNode('tags: '));
        fieldsP.appendChild(document.createElement('br'));
        const tagsInput = document.createElement('input');
        tagsInput.type = 'text';
        tagsInput.id = 'tags';
        tagsInput.className = 'form-input';
        fieldsP.appendChild(tagsInput);
        form.appendChild(fieldsP);

        h2Form.appendChild(form);
        rateFormContent.appendChild(h2Form);

        const uploadPreview = document.createElement('div');
        uploadPreview.id = 'uploadPreview';
        rateFormContent.appendChild(uploadPreview);

      //  initializeFaceCensoring();
        // share to room button
        if (typeof client !== 'undefined' && client) {
            const form = document.getElementById('rateForm');
            const shareButton = document.createElement('button');
            shareButton.type = 'button';
            shareButton.textContent = 'Share with Room';
            shareButton.id = 'shareWithRoom';
            form.appendChild(shareButton);

            shareButton.addEventListener('click', function() {
                const formData = new FormData(form);
                const cops = [];
                if (copId) {
                    const cop = copsData.find(c => c.id === copId);
                    if (cop) {
                        cops.push({
                            first: cop.first,
                            last: cop.last,
                            dept: cop.dept,
                            rank: cop.rank,
                            badge: cop.badge,
                            escalated: formData.get('cops-0-esc') === 'y',
                            deEscalated: formData.get('cops-0-de_esc') === 'y'
                        });
                    }
                }
                const formEntries = Array.from(formData.entries());
                const copGroups = new Map();

                formEntries.forEach(([key, value]) => {
                    const match = key.match(/^cops-(\d+)-(.+)$/);
                    if (match) {
                        const index = parseInt(match[1]);
                        const field = match[2];
                        if (copId && index === 0) return; // mirror backend logic
                        if (!copGroups.has(index)) {
                            copGroups.set(index, {});
                        }
                        copGroups.get(index)[field] = value;
                    }
                });

                for (const [index, copData] of copGroups) {
                    const first = (copData.first || '').trim();
                    const last = (copData.last || '').trim();
                    const dept = (copData.dept || '').trim();
                    const rank = (copData.rank || '').trim();
                    const badge = (copData.badge || '').trim();

                    if (first || last) {
                        cops.push({
                            first,
                            last,
                            dept,
                            rank,
                            badge,
                            escalated: copData.esc === 'y',
                            deEscalated: copData.de_esc === 'y'
                        });
                    }
                }
                if (cops.length === 0) {
                    alert('No valid cop data to share.');
                    return;
                }

                const rating = {
                    type: 'rating',
                    id: crypto.randomUUID(),
                    time: formData.get('time'),
                    location: formData.get('loc'),
                    description: formData.get('txt'),
                    tags: document.getElementById('tags')?.value || '',
                    cops: cops
                };

                sendRatingMessage(rating);
                alert('Shared with the room!');
            });
        }

        const addCopButton = document.getElementById('add-cop');
        if (addCopButton) {
            addCopButton.addEventListener('click', function() {
                appendNewCopTag(document.getElementById('cop-tags'));
            });
        }
        document.addEventListener('click', function(e) {
            if (e.target && e.target.className === 'remove-cop') {
                e.target.closest('.cop-tag').remove();
            }
        });

        DOM.searchControls.style.display = 'none';
        DOM.sf.style.display = 'none';
        DOM.sortControls.style.display = 'none';
        DOM.deptFilter.style.display = 'none';
        DOM.resultsContainer.style.display = 'none';
        DOM.copView.style.display = 'none';
        DOM.rateView.style.display = 'none';
        rateFormView.style.display = 'block';
    }

function performSearch(searchTerm = '') {
        const resultsContainer = DOM.resultsContainer;
        resultsContainer.replaceChildren();
        if (!searchTerm && currentView === 'all') {
            resultsContainer.appendChild(document.createElement('p'));
            resultsContainer.appendChild(document.createElement('br'));
            const upBtn = document.createElement('button');
            upBtn.style.height = '500%';
            upBtn.textContent = 'UPLOAD RATING';
            upBtn.addEventListener('click', () => view_rateform());
            resultsContainer.appendChild(upBtn);
            return;
        }
        const selectedDept = DOM.deptFilter.value;
        const searchWords = searchTerm.toLowerCase().split(/\s+/).filter(word => word.length > 0);
        const matchesSearch = (item) => {
            if (!searchTerm) return true;
            return searchWords.every(word => 
                Object.values(item).some(val => 
                    val && val.toString().toLowerCase().includes(word)
                )
            );
        };
        const matchesDept = (item) => {
            if (!selectedDept) return true;
            if (item.dept) return item.dept === selectedDept;
            if (item.cops) {
                const deptMatch = item.cops.match(/- ([^-]+)(?:\s|$)/);
                return deptMatch && deptMatch[1] === selectedDept;
            }
            return false;
        };
        const results = [];
        if (currentView === 'all' || currentView === 'cops') {
            results.push(...copsData
                .filter(cop => matchesSearch(cop) && matchesDept(cop))
                .map(cop => ({ type: 'cop', data: cop }))
            );
        }
        if (currentView === 'all' || currentView === 'rates') {
            results.push(...ratesData
                .filter(rate => matchesSearch(rate) && matchesDept(rate))
                .map(rate => {
                    const rateWithEscde_esc = copsData
                        .flatMap(cop => cop.ratings)
                        .find(r => r.id === rate.id);
                    return {
                        type: 'rate',
                        data: rateWithEscde_esc ? { ...rateWithEscde_esc, cops: rate.cops } : rate
                    };
                })
            );
        }
        const activeSortButton = document.querySelector('.sort-button.active');
        if (activeSortButton) {
            const field = activeSortButton.dataset.sort;
            const direction = activeSortButton.dataset.direction;
            results.sort((a, b) => {
                let valueA, valueB;
                
                if (field === 'time') {
                    valueA = new Date(a.data.time).getTime();
                    valueB = new Date(b.data.time).getTime();
                } else if (field === 'sal') {
                    valueA = a.data[field] || 0;
                    valueB = b.data[field] || 0;
                } else if (field === 'ratings') {
                    valueA = a.data.ratings?.length || 0;
                    valueB = b.data.ratings?.length || 0;
                } else {
                    valueA = a.data[field]?.toLowerCase() || '';
                    valueB = b.data[field]?.toLowerCase() || '';
                }

                if (direction === 'asc') {
                    return valueA > valueB ? 1 : -1;
                } else {
                    return valueA < valueB ? 1 : -1;
                }
            });
        }
        if (results.length === 0) {
            const emptyP = document.createElement('p');
            emptyP.appendChild(document.createTextNode('Not in database? Rate New or Unknown Cops '));
            const hereA = document.createElement('a');
            hereA.href = '/ratecops';
            hereA.textContent = 'here';
            emptyP.appendChild(hereA);
            resultsContainer.appendChild(emptyP);
            return;
        }
        updateResultsDisplay(results);
    }

function updateResultsDisplay(results) {
    const resultsContainer = DOM.resultsContainer;
    const fragment = document.createDocumentFragment();
    
    // Only display up to currentDisplayCount items
    const displayResults = results.slice(0, currentDisplayCount);
    
    displayResults.forEach(result => {
        const div = document.createElement('div');
        div.className = 'result-item';
        fillResultItem(div, result);
        div.addEventListener('click', () => result.type === 'cop' ?
            view_cop(result.data.id) :
            view_rating(result.data.id));
        fragment.appendChild(div);
    });

    resultsContainer.replaceChildren();
    resultsContainer.appendChild(fragment);
    
    // Add "Show More" button if there are more results
    if (results.length > currentDisplayCount) {
        const showMoreButton = document.createElement('button');
        showMoreButton.className = 'show-more-button';
        showMoreButton.textContent = `Show More (${results.length - currentDisplayCount} remaining)`;
        showMoreButton.onclick = () => {
            currentDisplayCount += 100;
            performSearch(DOM.searchInput.value.toLowerCase());
        };
        resultsContainer.appendChild(showMoreButton);
    }
    DOM.toggle.style.display = "block";
}

