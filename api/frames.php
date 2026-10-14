<?php
// GET  -> { frames: [...] }                              public list of shared frames
// POST action=save   name kind def badge corner png     -> { ok, frame, token }   (anyone, rate limited)
// POST action=delete id token | key                     -> { ok }   (owner token, or optional admin key)
// POST action=check  key                                -> { ok }   (verifies the optional admin key)
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
        mm_respond(200, ['frames' => mm_public_frames(mm_read_frames($dataDir))]);
    }
    if ($method !== 'POST') {
        mm_respond(405, ['ok' => false, 'error' => 'Método no permitido.']);
    }

    // PHP silently drops the whole body when it exceeds post_max_size.
    if (empty($_POST) && !empty($_SERVER['CONTENT_LENGTH'])) {
        throw new MmError(413, 'El archivo es muy pesado para el servidor.');
    }

    $action = isset($_POST['action']) ? $_POST['action'] : '';
    $key = isset($_POST['key']) ? $_POST['key'] : '';
    $isAdmin = mm_check_key($dataDir, $key);
    if ($key !== '' && !$isAdmin) {
        usleep(800000); // slow down guessing
        throw new MmError(403, 'Clave de admin incorrecta.');
    }

    if ($action === 'check') {
        if (!$isAdmin) throw new MmError(403, 'Clave de admin incorrecta.');
        mm_respond(200, ['ok' => true]);
    }
    if ($action === 'save') {
        if (!$isAdmin) mm_rate_limit($dataDir, isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '');
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
        list($frame, $token) = mm_save_frame($dataDir, $uploadDir, $_POST, $files);
        unset($frame['owner']);
        mm_respond(200, ['ok' => true, 'frame' => $frame, 'token' => $token]);
    }
    if ($action === 'delete') {
        $token = isset($_POST['token']) ? $_POST['token'] : '';
        mm_delete_frame($dataDir, $uploadDir, isset($_POST['id']) ? $_POST['id'] : '', $token, $isAdmin);
        mm_respond(200, ['ok' => true]);
    }
    throw new MmError(400, 'Acción no válida.');
} catch (MmError $e) {
    mm_respond($e->status, ['ok' => false, 'error' => $e->getMessage()]);
} catch (Throwable $e) {
    error_log('mixnmatch api: ' . $e->getMessage());
    mm_respond(500, ['ok' => false, 'error' => 'Error del servidor.']);
}
