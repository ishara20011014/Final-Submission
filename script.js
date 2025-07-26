const map = L.map('map').setView([7.8731, 80.7718], 8);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const categoryFields = {
  slope: 'DN',
  elevation: 'DN',
  roads: 'road_cla_1',
  schools: 'school_lev',
  training: 'name_of_th',
  hospitals: 'hospital_c',
  developableLand: 'DN'
};

const layers = {};
const activeLayers = new Set();
const categorizedData = {};

let pendingLayer = null;

function getColor(value, categorySet) {
  const categories = Array.from(categorySet).sort();
  const index = categories.indexOf(value);
  const hue = 360 * (index / categories.length);
  return `hsl(${hue}, 70%, 60%)`;
}

function loadGeoJson(url, layerName, styleFn) {
  fetch(url)
    .then(response => response.json())
    .then(data => {
      const field = categoryFields[layerName];
      categorizedData[layerName] = new Set(data.features.map(f => f.properties[field]));

      layers[layerName] = L.geoJSON(data, {
        style: feature => {
          const category = feature.properties[field];
          return {
            fillColor: getColor(category, categorizedData[layerName]),
            color: getColor(category, categorizedData[layerName]),
            weight: getWeight(layerName),
            fillOpacity: getOpacity(layerName),
          };
        },
        pointToLayer: (feature, latlng) => {
          if (isPointLayer(layerName)) {
            const category = feature.properties[field];
            return L.circleMarker(latlng, {
              radius: 6,
              fillColor: getColor(category, categorizedData[layerName]),
              color: '#333',
              weight: 1,
              fillOpacity: 0.9
            });
          }
          return L.marker(latlng);
        },
        onEachFeature: (feature, layer) => {
          layer.on({
            click: () => map.fitBounds(layer.getBounds()),
            mouseover: (e) => {
              const popupContent = Object.entries(feature.properties).map(([key, val]) => `
                <b>${key}</b>: ${val}<br/>
              `).join('');
              layer.bindPopup(popupContent).openPopup(e.latlng);
            },
            mouseout: () => {
              layer.closePopup();
            }
          });
        }
      });

      if (pendingLayer === layerName) {
        showLayer(layerName);
        activeLayers.add(layerName);
        updateLegend(layerName);
        toggleLayerInfo();
        pendingLayer = null;
      }
    });
}

function getWeight(layerName) {
  if (['roads'].includes(layerName)) return 3;
  if (isPointLayer(layerName)) return 1;
  return 1.5;
}

function getOpacity(layerName) {
  return isPointLayer(layerName) ? 1 : 0.6;
}

function isPointLayer(layerName) {
  return ['schools', 'training', 'hospitals'].includes(layerName);
}

function toggleLayer(layerName, group) {
  activeLayers.forEach(name => {
    if (map.hasLayer(layers[name])) {
      map.removeLayer(layers[name]);
    }
  });
  activeLayers.clear();

  if (layers[layerName]) {
    showLayer(layerName);
    activeLayers.add(layerName);
    updateLegend(layerName);
    toggleLayerInfo();
  } else {
    pendingLayer = layerName;
  }
}

function showLayer(layerName) {
  layers[layerName].addTo(map);
}

function toggleLayerInfo() {
  const infoDiv = document.getElementById('layerInfo');
  const showInfoLayers = ['slope', 'elevation', 'developableLand'];
  const shouldShow = Array.from(activeLayers).some(layer => showInfoLayers.includes(layer));
  infoDiv.style.display = shouldShow ? 'block' : 'none';
}

function updateLegend(layerName) {
  const legendDiv = document.getElementById('legendContent');
  const field = categoryFields[layerName];
  const categories = Array.from(categorizedData[layerName]).sort();

  let html = `<strong>${layerName.toUpperCase()}</strong><br/>`;
  categories.forEach(cat => {
    const color = getColor(cat, categorizedData[layerName]);
    const shapeStyle = isPointLayer(layerName)
      ? `<div class="legend-color" style="background:${color}; border-radius:50%;"></div>`
      : ['roads'].includes(layerName)
        ? `<div class="legend-line" style="background:${color};"></div>`
        : `<div class="legend-color" style="background:${color};"></div>`;

    html += `<div class="legend-item">${shapeStyle}<span>${cat}</span></div>`;
  });

  legendDiv.innerHTML = html;
}

// Load layers
loadGeoJson('https://raw.githubusercontent.com/Kavish20021203/Ishara/main/Slope.geojson', 'slope');
loadGeoJson('https://raw.githubusercontent.com/Kavish20021203/Ishara/main/Elevation.geojson', 'elevation');
loadGeoJson('https://raw.githubusercontent.com/Kavish20021203/Ishara/main/RoadLayer.geojson', 'roads');
loadGeoJson('https://raw.githubusercontent.com/Kavish20021203/Ishara/main/Schools.geojson', 'schools');
loadGeoJson('https://raw.githubusercontent.com/Kavish20021203/Ishara/main/VocationalTrainingCenters.geojson', 'training');
loadGeoJson('https://raw.githubusercontent.com/Kavish20021203/Ishara/main/Hospitals.geojson', 'hospitals');
loadGeoJson('https://raw.githubusercontent.com/Kavish20021203/Ishara/main/Developable%20Lands.geojson', 'developableLand');

function toggleDropdown(id) {
  const dropdown = document.getElementById(id);
  dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
}

let searchMarker = null;

function searchLocation() {
  const query = document.getElementById("searchBar").value;
  if (!query) return;

  fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`)
    .then(res => res.json())
    .then(data => {
      if (data.length > 0) {
        const loc = data[0];
        const lat = parseFloat(loc.lat);
        const lon = parseFloat(loc.lon);

        if (searchMarker) {
          map.removeLayer(searchMarker);
        }

        searchMarker = L.marker([lat, lon]).addTo(map).bindPopup(loc.display_name).openPopup();
        map.setView([lat, lon], 13);
      } else {
        alert("Location not found.");
      }
    })
    .catch(err => {
      console.error("Search error:", err);
    });
}

let distancePoints = [];
let distanceLine = null;

function startDistanceMeasure() {
  map.getContainer().style.cursor = 'crosshair';

  map.once('click', function (e) {
    if (distancePoints.length >= 2) resetDistance();

    distancePoints.push(e.latlng);

    if (distancePoints.length === 1) {
      L.marker(e.latlng).addTo(map);
      startDistanceMeasure();
    } else if (distancePoints.length === 2) {
      L.marker(e.latlng).addTo(map);
      drawDistanceLine();
      map.getContainer().style.cursor = '';
    }
  });
}

function drawDistanceLine() {
  const [p1, p2] = distancePoints;
  distanceLine = L.polyline([p1, p2], { color: '#176B87', weight: 4 }).addTo(map);

  const dist = map.distance(p1, p2);
  const km = (dist / 1000).toFixed(2);
  document.getElementById("distanceResult").innerText = `Distance: ${km} km`;
}

function resetDistance() {
  distancePoints = [];
  map.getContainer().style.cursor = '';
  map.eachLayer(layer => {
    if (layer instanceof L.Marker || layer instanceof L.Polyline) {
      if (layer !== searchMarker) {
        map.removeLayer(layer);
      }
    }
  });
  document.getElementById("distanceResult").innerText = "Distance: -";
}
