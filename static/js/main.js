document.addEventListener('DOMContentLoaded', () => {
    // Seletores de elementos DOM
    const mapElement = document.getElementById('map');
    const cnvFormExpanderButton = document.getElementById('toggle-cnv-form-btn');
    const cnvFormContainer = document.getElementById('mapa-cnv-form');
    const cnvForm = document.getElementById('cnv-form-mapa-interno');
    const cancelCnvFormBtn = document.getElementById('cancel-cnv-form-btn');
    const latitudeInput = document.getElementById('form-latitude');
    const longitudeInput = document.getElementById('form-longitude');
    const locationStatusMessage = document.getElementById('location-status-message');
    const submitCnvFormBtn = document.getElementById('submit-cnv-form-btn');
    const formFiltrosMapa = document.getElementById('formFiltrosMapa');
    const btnLimparFiltrosMapa = document.getElementById('btnLimparFiltrosMapa');
    const profileModalOverlayHome = document.getElementById('profile-modal-overlay-home');
    const locationModal = document.getElementById('location-permission-modal');
    const btnPermitirLoc = document.getElementById('btn-permitir-localizacao');
    const btnNegarLoc = document.getElementById('btn-negar-localizacao');

    // Variáveis de estado e Leaflet
    let currentMapClickMarker;
    let map;
    let userLocationMarkersLayer = L.layerGroup();
    let cnvMarkersLayer = L.layerGroup();
    let allCnvMarkersData = [];
    let currentFilters = {};

    // Função de utilidade para tratar erros de fetch
    const handleFetchError = (error, context) => {
        console.error(`Erro no contexto '${context}':`, error);
    };

    // LÓGICA DO MODAL DE PERFIL RÁPIDO
    if (profileModalOverlayHome) {
        const btnFecharProfileModalHome = profileModalOverlayHome.querySelector('.btn-fechar-modal-home');
        btnFecharProfileModalHome?.addEventListener('click', () => profileModalOverlayHome.style.display = 'none');
        profileModalOverlayHome.addEventListener('click', (e) => {
            if (e.target === profileModalOverlayHome) profileModalOverlayHome.style.display = 'none';
        });

        window.showProfileModal = (userId, nome, fotoUrl, pronomes) => {
            const modalProfileNomeHome = document.getElementById('modal-profile-nome-home');
            const modalProfileFotoHome = document.getElementById('modal-profile-foto-home');
            const modalProfilePronomesHome = document.getElementById('modal-profile-pronomes-home');
            const btnVerPerfilCompletoModal = document.getElementById('btn-ver-perfil-completo-modal');

            if (modalProfileNomeHome) modalProfileNomeHome.textContent = nome || 'Usuário';
            if (modalProfileFotoHome) {
                modalProfileFotoHome.src = fotoUrl || '/static/images/avatar_padrao.png';
                modalProfileFotoHome.alt = `Foto de ${nome || 'Usuário'}`;
            }
            if (modalProfilePronomesHome) modalProfilePronomesHome.textContent = pronomes || 'Não informado';
            if (btnVerPerfilCompletoModal) btnVerPerfilCompletoModal.href = `/perfil?id=${userId}`;
            if (profileModalOverlayHome) profileModalOverlayHome.style.display = 'flex';
        };
    }

    // MOSTRAR/ESCONDER FORMULÁRIO CNV
    const toggleCnvForm = (visible) => {
        if (visible) {
            cnvFormContainer?.classList.add('visible');
        } else {
            cnvFormContainer?.classList.remove('visible');
            cnvForm?.reset();
            document.getElementById('form-action').value = 'criar';
            document.getElementById('form-registro-id-editar').value = '';
            if(submitCnvFormBtn) submitCnvFormBtn.innerHTML = '<i class="fas fa-map-marker-alt"></i> Enviar Registro';
            if (currentMapClickMarker && map?.hasLayer(currentMapClickMarker) && !currentMapClickMarker.getPopup()) {
                map.removeLayer(currentMapClickMarker);
                currentMapClickMarker = null;
            }
        }
    };
    cnvFormExpanderButton?.addEventListener('click', () => toggleCnvForm(!cnvFormContainer.classList.contains('visible')));
    cancelCnvFormBtn?.addEventListener('click', () => toggleCnvForm(false));

    // INICIALIZAÇÃO DO MAPA
    if (mapElement) {
        map = L.map(mapElement).setView([-23.1896, -45.8841], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);

        cnvMarkersLayer.addTo(map);
        userLocationMarkersLayer.addTo(map);

        // LÓGICA DE LOCALIZAÇÃO DO USUÁRIO
        const handleLocationSuccess = async (position) => {
            locationModal?.classList.remove('visible');
            const { latitude, longitude } = position.coords;
            map.setView([latitude, longitude], 14);
            if (locationStatusMessage) locationStatusMessage.textContent = "Localização ativa. Buscando usuários próximos...";

            const formDataLoc = new FormData();
            formDataLoc.append('latitude', latitude);
            formDataLoc.append('longitude', longitude);

            try {
                await fetch('/api/mapa-violeta/update-user-location', { method: 'POST', body: formDataLoc });
            } catch (err) {
                handleFetchError(err, 'updateUserLocation');
            }
            loadOtherUsersMarkers();
            aplicarFiltrosDaUrl();
        };

        const handleLocationError = (error) => {
            locationModal?.classList.remove('visible');
            console.warn(`Erro ao obter localização: ${error.code} - ${error.message}`);
            if (locationStatusMessage) locationStatusMessage.textContent = "Não foi possível obter sua localização.";
            loadOtherUsersMarkers();
            aplicarFiltrosDaUrl();
        };

        if (navigator.geolocation) {
            navigator.permissions.query({ name: 'geolocation' }).then(permissionStatus => {
                if (permissionStatus.state === 'granted') {
                    navigator.geolocation.getCurrentPosition(handleLocationSuccess, handleLocationError, { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 });
                } else if (permissionStatus.state === 'prompt') {
                    locationModal?.classList.add('visible');
                } else {
                    handleLocationError({ code: 1, message: `Permissão de localização ${permissionStatus.state}.` });
                }
                permissionStatus.onchange = function() {
                    if (this.state === 'granted') {
                        navigator.geolocation.getCurrentPosition(handleLocationSuccess, handleLocationError, { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 });
                    } else {
                        handleLocationError({ code: 1, message: `Permissão de localização alterada para ${this.state}.` });
                    }
                }
            });
        } else {
            loadOtherUsersMarkers();
            aplicarFiltrosDaUrl();
        }

        btnPermitirLoc?.addEventListener('click', () => {
            locationModal?.classList.remove('visible');
            navigator.geolocation.getCurrentPosition(handleLocationSuccess, handleLocationError, { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 });
        });
        btnNegarLoc?.addEventListener('click', () => {
            locationModal?.classList.remove('visible');
            handleLocationError({ code: 1, message: "Usuário negou o pedido de localização." });
        });

        // CRIAÇÃO E MANIPULAÇÃO DE MARCADORES E POP-UPS
        const createCnvMarkerPopupContent = (ponto) => {
            const tipoFormatado = (ponto.tipo_registro || 'Registro').replace(/_/g, ' ');
            const tipoFormatadoCapitalized = tipoFormatado.charAt(0).toUpperCase() + tipoFormatado.slice(1);
            const nickPonto = ponto.nick_usuario || 'Anônimo';
            const dataRegistro = ponto.data_registro ? new Date(ponto.data_registro).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Data não disponível';

            let html = `<div class="popup-marker-details"><h4>${tipoFormatadoCapitalized}</h4>`;
            html += `<p><strong>Observação:</strong> ${ponto.cnv_observacao || 'N/A'}</p>`;
            html += ponto.cnv_sentimento ? `<p><strong>Sentimento:</strong> ${ponto.cnv_sentimento}</p>` : '';
            html += ponto.cnv_necessidade ? `<p><strong>Necessidade:</strong> ${ponto.cnv_necessidade}</p>` : '';
            html += ponto.cnv_pedido ? `<p><strong>Pedido:</strong> ${ponto.cnv_pedido}</p>` : '';
            html += ponto.descricao_adicional ? `<p><strong>Detalhes Adicionais:</strong> ${ponto.descricao_adicional}</p>` : '';
            html += ponto.data_evento_ocorrido ? `<p><small>Data do Fato: ${new Date(ponto.data_evento_ocorrido).toLocaleString('pt-BR')}</small></p>` : '';
            html += `<small>Por: <a href="#" class="link-abrir-perfil-modal" data-userid="${ponto.usuario_id}" data-nome="${nickPonto}" data-foto="${ponto.foto_perfil_usuario || '/static/images/avatar_padrao.png'}" data-pronomes="${ponto.pronomes_usuario || ''}" style="color: var(--mapa-violeta-cor-destaque); cursor:pointer;">${nickPonto}</a> em ${dataRegistro}</small></div>`;

            // Verificar se o usuário atual é admin ou dono do registro
            const isAdmin = document.body.getAttribute('data-is-admin') === 'true';
            const currentUserId = document.body.getAttribute('data-user-id');
            
            if (currentUserId && (ponto.usuario_id == currentUserId || isAdmin)) {
                html += `<div class="popup-marker-acoes-admin">
                           <button class="btn-editar-ponto-mapa btn btn--secondary btn-sm" data-registro-id="${ponto.id}" title="Editar"><i class="fas fa-edit"></i> Editar</button>
                           <button class="btn-apagar-ponto-mapa btn btn--danger btn-sm" data-registro-id="${ponto.id}" title="Apagar"><i class="fas fa-trash"></i> Apagar</button>
                         </div>`;
            }

            html += `<div class="popup-marker-comments-section">
                       <h5>Comentários:</h5>
                       <div id="comments-for-marker-${ponto.id}-popup">Carregando...</div>
                       <form class="form-comment-marker" data-registro-id="${ponto.id}">
                         <textarea name="texto_comentario_mapa" placeholder="Comentário CNV..." rows="2" required></textarea>
                         <button type="submit" class="btn">Comentar</button>
                       </form>
                     </div>`;
            return html;
        };

        const addCnvMarkerToMap = (ponto) => {
            const emojiMap = { 'alerta_perigo': '🚨', 'local_acolhedor': '💖', 'ponto_apoio': '🤝', 'evento_positivo': '🎉', 'denuncia_violencia': '🗣️', 'reivindicacao_melhoria': '🚧' };
            const emoji = emojiMap[ponto.tipo_registro] || '📍';
            const customIcon = L.divIcon({
                html: `<div style="font-size: 24px;">${emoji}</div>`,
                className: 'custom-emoji-icon', iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32]
            });
            const marker = L.marker([ponto.latitude, ponto.longitude], { icon: customIcon });
            marker.on('click', () => {
                const popupContent = createCnvMarkerPopupContent(ponto);
                marker.bindPopup(popupContent, { minWidth: 300, maxHeight: 400 }).openPopup();
            });
            cnvMarkersLayer.addLayer(marker);
        };
        
        map.on('click', (e) => {
            let clickedOnExistingCnvMarker = false;
            cnvMarkersLayer.eachLayer(layer => {
                if (layer instanceof L.Marker && layer.getLatLng().equals(e.latlng)) {
                    clickedOnExistingCnvMarker = true;
                }
            });
            if (clickedOnExistingCnvMarker) return;
            
            if (cnvFormContainer.classList.contains('visible')) {
                toggleCnvForm(false);
            } else {
                if (currentMapClickMarker) map.removeLayer(currentMapClickMarker);
                currentMapClickMarker = L.marker(e.latlng).addTo(map);
                if (latitudeInput) latitudeInput.value = e.latlng.lat;
                if (longitudeInput) longitudeInput.value = e.latlng.lng;
                toggleCnvForm(true);
            }
        });

        // LÓGICA DE DADOS (FETCH)
        const loadMapMarkersFiltered = async (filters = {}) => {
            const queryString = new URLSearchParams(filters).toString();
            const apiUrl = `/api/mapa-violeta/get-pontos-mapa${queryString ? '?' + queryString : ''}`;
            try {
                const response = await fetch(apiUrl);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const resultado = await response.json();
                cnvMarkersLayer.clearLayers();
                allCnvMarkersData = [];
                if (resultado.success && resultado.data) {
                    allCnvMarkersData = resultado.data;
                    allCnvMarkersData.forEach(addCnvMarkerToMap);
                }
            } catch (error) {
                handleFetchError(error, 'loadMapMarkersFiltered');
            }
        };

        const loadOtherUsersMarkers = async () => {
            userLocationMarkersLayer.clearLayers();
            try {
                const response = await fetch('/api/mapa-violeta/get-users-locations');
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const data = await response.json();
                if (data.success && data.users) {
                    if (locationStatusMessage) {
                        locationStatusMessage.textContent = data.users.length > 0 ? `Exibindo ${data.users.length} usuário(s) próximo(s).` : "Nenhum outro usuário online com localização compartilhada.";
                    }
                    data.users.forEach(user => {
                        const currentUserId = document.body.getAttribute('data-user-id');
                        if (user.latitude_atual && user.longitude_atual && user.id != currentUserId) {
                            const userIcon = L.divIcon({
                                html: `<div style="background-image: url('${user.foto_perfil_usuario || '/static/images/avatar_padrao.png'}');" class="user-map-icon"></div>`,
                                className: '', iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -15]
                            });
                            const userMarker = L.marker([user.latitude_atual, user.longitude_atual], { icon: userIcon })
                                .bindPopup(`<b><a href="#" class="link-abrir-perfil-modal" data-userid="${user.id}" data-nome="${user.nick_usuario || 'Usuário'}" data-foto="${user.foto_perfil_usuario || '/static/images/avatar_padrao.png'}" data-pronomes="${user.pronomes_usuario || ''}" style="color: var(--mapa-violeta-cor-destaque); cursor:pointer;">${user.nick_usuario || 'Usuário'}</a></b>`);
                            userLocationMarkersLayer.addLayer(userMarker);
                        }
                    });
                }
            } catch (error) {
                handleFetchError(error, 'loadOtherUsersMarkers');
            }
        };
        
        // EVENT LISTENERS DE SUBMISSÃO E FILTROS
        cnvForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!latitudeInput.value || !longitudeInput.value) {
                alert("Clique no mapa para definir a localização."); return;
            }
            const formData = new FormData(cnvForm);
            if (submitCnvFormBtn) submitCnvFormBtn.disabled = true;
            try {
                const response = await fetch('/api/mapa-violeta/registrar-ponto-mapa', { method: 'POST', body: formData });
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const resultado = await response.json();
                if (resultado.success) {
                    alert(resultado.mensagem || "Ação concluída com sucesso!");
                    toggleCnvForm(false);
                    loadMapMarkersFiltered(currentFilters);
                } else {
                    alert("Erro: " + (resultado.mensagem || "Tente novamente."));
                }
            } catch (error) {
                handleFetchError(error, 'submitCnvForm');
            } finally {
                if (submitCnvFormBtn) submitCnvFormBtn.disabled = false;
            }
        });
        
        formFiltrosMapa?.addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = new FormData(formFiltrosMapa);
            currentFilters = {};
            for (let [key, value] of formData.entries()) {
                if (value) currentFilters[key] = value;
            }
            const url = new URL(window.location);
            url.search = new URLSearchParams(currentFilters).toString();
            history.pushState({}, '', url);
            loadMapMarkersFiltered(currentFilters);
        });

        btnLimparFiltrosMapa?.addEventListener('click', () => {
            formFiltrosMapa.reset();
            currentFilters = {};
            history.pushState({}, '', window.location.pathname);
            loadMapMarkersFiltered();
        });

        const aplicarFiltrosDaUrl = () => {
            const urlParams = new URLSearchParams(window.location.search);
            let filtrosDaUrl = {};
            urlParams.forEach((value, key) => {
                if (key.startsWith('filtro_') && value) {
                    filtrosDaUrl[key] = value;
                    const inputElement = document.getElementById(key);
                    if (inputElement) inputElement.value = value;
                }
            });
            currentFilters = filtrosDaUrl;
            loadMapMarkersFiltered(currentFilters);
        };
        
        // DELEGATION DE EVENTOS PARA POP-UPS
        map.on('popupopen', (e) => {
            const popupNode = e.popup.getElement();
            
            // Perfil modal
            popupNode.querySelectorAll('.link-abrir-perfil-modal').forEach(link => {
                if (link.dataset.listener) return;
                link.addEventListener('click', (event) => {
                    event.preventDefault();
                    window.showProfileModal(link.dataset.userid, link.dataset.nome, link.dataset.foto, link.dataset.pronomes);
                });
                link.dataset.listener = 'true';
            });
            
            // Carregar e submeter comentários
            const commentForm = popupNode.querySelector('.form-comment-marker');
            if (commentForm && !commentForm.dataset.listener) {
                const registroId = commentForm.dataset.registroId;
                const commentsDiv = popupNode.querySelector(`#comments-for-marker-${registroId}-popup`);
                
                const loadCnvMarkerComments = async () => {
                     if (!commentsDiv) return;
                     commentsDiv.innerHTML = '<p><small>Carregando...</small></p>';
                     try {
                         const response = await fetch(`/api/mapa-violeta/get-mapa-comentarios?registro_id=${registroId}`);
                         if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                         const result = await response.json();
                         commentsDiv.innerHTML = '';
                         if (result.success && result.comentarios?.length > 0) {
                             result.comentarios.forEach(comment => {
                                 const commentEl = document.createElement('div');
                                 commentEl.className = 'map-comment-item';
                                 commentEl.innerHTML = `<small><strong class="link-abrir-perfil-modal" data-userid="${comment.usuario_id}" data-nome="${comment.nick_usuario}" data-foto="${comment.foto_perfil_usuario || '/static/images/avatar_padrao.png'}" data-pronomes="${comment.pronomes_usuario || ''}" style="cursor:pointer;">@${comment.nick_usuario}</strong>: ${comment.texto_comentario} <em>(${new Date(comment.data_comentario).toLocaleDateString('pt-BR')})</em></small>`;
                                 commentsDiv.appendChild(commentEl);
                             });
                         } else {
                             commentsDiv.innerHTML = '<p><small>Nenhum comentário.</small></p>';
                         }
                     } catch (err) { handleFetchError(err, 'loadCnvMarkerComments'); }
                };

                commentForm.addEventListener('submit', async (event) => {
                    event.preventDefault();
                    const textarea = commentForm.querySelector('textarea');
                    if (!textarea.value.trim()) return;
                    const submitButton = commentForm.querySelector('button[type="submit"]');
                    if(submitButton) submitButton.disabled = true;
                    
                    const formData = new FormData();
                    formData.append('registro_id', registroId);
                    formData.append('texto_comentario_mapa', textarea.value);
                    
                    try {
                        const response = await fetch('/api/mapa-violeta/registrar-mapa-comentario', { method: 'POST', body: formData });
                        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                        const result = await response.json();
                        if (result.success) {
                            textarea.value = '';
                            loadCnvMarkerComments();
                        }
                    } catch (err) { handleFetchError(err, 'submitComment'); }
                    finally { if(submitButton) submitButton.disabled = false; }
                });

                loadCnvMarkerComments();
                commentForm.dataset.listener = 'true';
            }

            // Ações de Admin (Editar/Apagar)
            const btnEditar = popupNode.querySelector('.btn-editar-ponto-mapa');
            if(btnEditar && !btnEditar.dataset.listener){
                btnEditar.addEventListener('click', () => {
                    const ponto = allCnvMarkersData.find(p => p.id == btnEditar.dataset.registroId);
                    if(ponto){
                        // Preencher formulário
                        document.getElementById('form-action').value = 'editar';
                        document.getElementById('form-registro-id-editar').value = ponto.id;
                        latitudeInput.value = ponto.latitude;
                        longitudeInput.value = ponto.longitude;
                        document.getElementById('tipo_registro_mapa').value = ponto.tipo_registro;
                        document.getElementById('cnv_observacao_mapa').value = ponto.cnv_observacao;
                        document.getElementById('cnv_sentimento_mapa').value = ponto.cnv_sentimento;
                        document.getElementById('cnv_necessidade_mapa').value = ponto.cnv_necessidade;
                        document.getElementById('cnv_pedido_mapa').value = ponto.cnv_pedido;
                        document.getElementById('descricao_adicional_mapa').value = ponto.descricao_adicional || '';
                        const dataInput = document.getElementById('data_evento_ocorrido_mapa');
                        if(dataInput && ponto.data_evento_ocorrido) dataInput.value = ponto.data_evento_ocorrido.replace(' ', 'T').substring(0,16);

                        if(submitCnvFormBtn) submitCnvFormBtn.innerHTML = '<i class="fas fa-save"></i> Salvar Alterações';
                        toggleCnvForm(true);
                        map.closePopup();
                    }
                });
                btnEditar.dataset.listener = 'true';
            }
            
            const btnApagar = popupNode.querySelector('.btn-apagar-ponto-mapa');
            if(btnApagar && !btnApagar.dataset.listener){
                btnApagar.addEventListener('click', async () => {
                    if (confirm("Tem certeza que deseja apagar este registro?")) {
                        const formData = new FormData();
                        formData.append('action', 'apagar');
                        formData.append('registro_id_apagar', btnApagar.dataset.registroId);
                        try{
                            const response = await fetch('/api/mapa-violeta/registrar-ponto-mapa', { method: 'POST', body: formData });
                            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                            const result = await response.json();
                            if(result.success){
                                alert(result.mensagem || "Registro apagado!");
                                map.closePopup();
                                loadMapMarkersFiltered(currentFilters);
                            }
                        } catch(err) { handleFetchError(err, 'deleteMarker'); }
                    }
                });
                btnApagar.dataset.listener = 'true';
            }
        });

        // ATUALIZAÇÕES PERIÓDICAS
        setInterval(() => loadMapMarkersFiltered(currentFilters), 300000); // 5 min
        setInterval(loadOtherUsersMarkers, 60000); // 1 min
        
        // Carregar marcadores iniciais
        loadMapMarkersFiltered();
    }
});
