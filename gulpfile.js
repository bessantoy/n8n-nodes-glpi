const { src, dest, series } = require('gulp');

function buildIcons() {
	return src('nodes/**/*.{png,svg}').pipe(dest('dist/nodes'));
}

function copyEndpointIndex() {
	return src('resources/glpi-endpoints-index.json').pipe(dest('dist/nodes/Glpi/resources'));
}

// GlpiFindEndpoint's SearchEngine reuses Glpi/EndpointIndex.js for the endpoints
// themselves, but needs its own copy of the schemas index (bodyFields lookup).
function copySchemasIndex() {
	return src('resources/glpi-schemas-index.json').pipe(dest('dist/nodes/GlpiFindEndpoint/resources'));
}

exports['build:icons'] = series(buildIcons, copyEndpointIndex, copySchemasIndex);
