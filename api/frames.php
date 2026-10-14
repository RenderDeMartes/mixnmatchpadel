<?php
// GET  -> { frames: [...] }                         public list of shared frames
// POST action=check  key                           -> { ok }
// POST action=save   key name kind def badge corner png -> { ok, frame }
// POST action=delete key id                         -> { ok }
require __DIR__ . '/lib.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function mm_respond($status, $body)
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$dataDir = mm_data_dir();
$uploadDir = mm_upload_dir();

try {
    $method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';

    if ($method === 'GET') {
        mm_respond(200, ['frames' => mm_read_frames($dataDir)]);
    }
    if ($method !== 'POST') {
        mm_respond(405, ['ok' => false, 'error' => 'Método no permitido.']);
    }

    // PHP silently drops the whole body when it exceeds post_max_size.
    if (empty($_POST) && !empty($_SERVER['CONTENT_LENGTH'])) {
        throw new MmError(413, 'El archivo es muy pesado para el servidor.');
    }

    if (!mm_check_key($dataDir, isset($_POST['key']) ? $_POST['key'] : '')) {
        usleep(800000); // slow down guessing
        throw new MmError(403, 'Clave de admin incorrecta.');
    }

    $action = isset($_POST['action']) ? $_POST['action'] : '';
    if ($action === 'check') {
        mm_respond(200, ['ok' => true]);
    }
    if ($action === 'save') {
        $files = [];
        foreach (['badge', 'corner', 'png'] as $slot) {
            if (!isset($_FILES[$slot])) continue;
            $f = $_FILES[$slot];
            if ($f['error'] === UPLOAD_ERR_INI_SIZE || $f['error'] === UPLOAD_ERR_FORM_SIZE) {
                throw new MmError(413, 'La imagen es muy pesada para el servidor.');
            }
            if ($f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) {
                throw new MmError(400, 'No se pudo recibir la imagen.');
            }
            $files[$slot] = $f['tmp_name'];
        }
        $frame = mm_save_frame($dataDir, $uploadDir, $_POST, $files);
        mm_respond(200, ['ok' => true, 'frame' => $frame]);
    }
    if ($action === 'delete') {
        mm_delete_frame($dataDir, $uploadDir, isset($_POST['id']) ? $_POST['id'] : '');
        mm_respond(200, ['ok' => true]);
    }
    throw new MmError(400, 'Acción no válida.');
} catch (MmError $e) {
    mm_respond($e->status, ['ok' => false, 'error' => $e->getMessage()]);
} catch (Throwable $e) {
    error_log('mixnmatch api: ' . $e->getMessage());
    mm_respond(500, ['ok' => false, 'error' => 'Error del servidor.']);
}
